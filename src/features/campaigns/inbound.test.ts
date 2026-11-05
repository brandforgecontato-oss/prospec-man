import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fetchProfileUsername = vi.fn();
vi.mock("@/integrations/instagram/client", () => ({
  fetchProfileUsername: (...args: unknown[]) => fetchProfileUsername(...args),
}));

const tryTransitionChannelState = vi.fn();
vi.mock("./channel-lock", async () => {
  const actual = await vi.importActual<typeof import("./channel-lock")>("./channel-lock");
  return {
    tryTransitionChannelState: (...args: Parameters<typeof actual.tryTransitionChannelState>) =>
      tryTransitionChannelState(...args) ?? actual.tryTransitionChannelState(...args),
  };
});

describe("pollWebhookInbox", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let inbound: typeof import("./inbound");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    process.env.INSTAGRAM_APP_SECRET = "app-secret";
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "verify-token";
    process.env.INSTAGRAM_ACCESS_TOKEN = "token";
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "biz-1";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    inbound = await import("./inbound");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM jobs");
    sqlite.exec("DELETE FROM messages");
    sqlite.exec("DELETE FROM leads");
    fetchProfileUsername.mockReset();
    tryTransitionChannelState.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createLead(overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
    return db
      .insert(schema.leads)
      .values({
        instagramUsername: "loja_teste",
        pipelineStage: "contacted",
        channelState: "waiting_inbound_reply",
        ...overrides,
      })
      .returning({ id: schema.leads.id })
      .get().id;
  }

  it("matches by an already-known IGSID, records the message and hands the channel to the API", async () => {
    const leadId = createLead({ instagramUserId: "igsid-1" });

    await inbound.pollWebhookInbox({
      mid: "mid-1",
      senderId: "igsid-1",
      recipientId: "biz-1",
      text: "Oi!",
      timestamp: 1700000000000,
    });

    expect(fetchProfileUsername).not.toHaveBeenCalled();

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.pipelineStage).toBe("replied");
    expect(lead?.channelState).toBe("api_active");

    const message = db.select().from(schema.messages).where(eq(schema.messages.leadId, leadId)).get();
    expect(message?.direction).toBe("inbound");
    expect(message?.channel).toBe("api");
    expect(message?.providerMessageId).toBe("mid-1");

    const job = sqlite.prepare("SELECT type, idempotency_key FROM jobs WHERE type = 'decide_and_reply'").get() as
      | { type: string; idempotency_key: string }
      | undefined;
    expect(job?.idempotency_key).toBe("decide_and_reply:mid-1");
  });

  it("chains into decide_and_reply for a follow-up message on an already-api_active lead", async () => {
    const leadId = createLead({ pipelineStage: "replied", channelState: "api_active", instagramUserId: "igsid-1" });

    await inbound.pollWebhookInbox({
      mid: "mid-6",
      senderId: "igsid-1",
      recipientId: "biz-1",
      text: "E o preço?",
      timestamp: 1700000000000,
    });

    const job = sqlite.prepare("SELECT lead_id FROM jobs WHERE type = 'decide_and_reply'").get() as
      | { lead_id: number }
      | undefined;
    expect(job?.lead_id).toBe(leadId);
  });

  it("resolves an unknown IGSID via the Graph API and matches it to the waiting lead by username", async () => {
    const leadId = createLead();
    fetchProfileUsername.mockResolvedValueOnce("loja_teste");

    await inbound.pollWebhookInbox({
      mid: "mid-2",
      senderId: "igsid-new",
      recipientId: "biz-1",
      text: "Oi!",
      timestamp: 1700000000000,
    });

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.instagramUserId).toBe("igsid-new");
    expect(lead?.channelState).toBe("api_active");
  });

  it("records an unmatched event and does not create a message when no lead resolves", async () => {
    fetchProfileUsername.mockResolvedValueOnce(null);

    await inbound.pollWebhookInbox({
      mid: "mid-3",
      senderId: "igsid-unknown",
      recipientId: "biz-1",
      text: "Oi!",
      timestamp: 1700000000000,
    });

    const message = db.select().from(schema.messages).where(eq(schema.messages.providerMessageId, "mid-3")).get();
    expect(message).toBeUndefined();

    const event = sqlite
      .prepare("SELECT type FROM events WHERE type = 'webhook_message_unmatched'")
      .get() as { type: string } | undefined;
    expect(event?.type).toBe("webhook_message_unmatched");
  });

  it("is idempotent for a duplicate mid", async () => {
    const leadId = createLead({ instagramUserId: "igsid-1" });
    const event = { mid: "mid-dup", senderId: "igsid-1", recipientId: "biz-1", text: "Oi!", timestamp: 1700000000000 };

    await inbound.pollWebhookInbox(event);
    await inbound.pollWebhookInbox(event);

    const count = sqlite
      .prepare("SELECT COUNT(*) as count FROM messages WHERE provider_message_id = 'mid-dup'")
      .get() as { count: number };
    expect(count.count).toBe(1);

    const message = db.select().from(schema.messages).where(eq(schema.messages.leadId, leadId)).get();
    expect(message?.providerMessageId).toBe("mid-dup");
  });

  it("does not downgrade a lead that already moved past 'contacted'", async () => {
    const leadId = createLead({ pipelineStage: "interested", channelState: "api_active", instagramUserId: "igsid-1" });

    await inbound.pollWebhookInbox({
      mid: "mid-4",
      senderId: "igsid-1",
      recipientId: "biz-1",
      text: "Outra mensagem",
      timestamp: 1700000000000,
    });

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.pipelineStage).toBe("interested");

    const stageEvent = sqlite
      .prepare("SELECT COUNT(*) as count FROM events WHERE type = 'pipeline_stage_changed' AND lead_id = ?")
      .get(leadId) as { count: number };
    expect(stageEvent.count).toBe(0);
  });

  it("records the message and advances the pipeline even when it loses the channel handoff race", async () => {
    const leadId = createLead({ instagramUserId: "igsid-1" });
    // Simulate a concurrent send_browser_dm reservation (or an operator
    // action) winning the CAS for channel ownership.
    tryTransitionChannelState.mockReturnValueOnce(false);

    await inbound.pollWebhookInbox({
      mid: "mid-5",
      senderId: "igsid-1",
      recipientId: "biz-1",
      text: "Oi!",
      timestamp: 1700000000000,
    });

    const message = db.select().from(schema.messages).where(eq(schema.messages.providerMessageId, "mid-5")).get();
    expect(message?.direction).toBe("inbound");

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.pipelineStage).toBe("replied");
    expect(lead?.channelState).toBe("waiting_inbound_reply");

    const lockLostEvent = sqlite
      .prepare("SELECT COUNT(*) as count FROM events WHERE type = 'channel_lock_lost' AND lead_id = ?")
      .get(leadId) as { count: number };
    expect(lockLostEvent.count).toBe(1);

    const job = sqlite.prepare("SELECT COUNT(*) as count FROM jobs WHERE type = 'decide_and_reply'").get() as {
      count: number;
    };
    expect(job.count).toBe(0);
  });
});
