import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendApiMessage = vi.fn();
vi.mock("@/integrations/instagram/client", () => ({
  sendApiMessage: (...args: unknown[]) => sendApiMessage(...args),
  fetchProfileUsername: vi.fn(),
}));

describe("sendApiMessage (job handler)", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let apiOutreach: typeof import("./api-outreach");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    process.env.INSTAGRAM_APP_SECRET = "app-secret";
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "verify-token";
    process.env.INSTAGRAM_ACCESS_TOKEN = "token";
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "biz-1";
    process.env.INSTAGRAM_MESSAGING_WINDOW_HOURS = "24";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    apiOutreach = await import("./api-outreach");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM messages");
    sqlite.exec("DELETE FROM leads");
    sendApiMessage.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createLead(overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
    return db
      .insert(schema.leads)
      .values({
        instagramUsername: "loja_teste",
        channelState: "api_active",
        instagramUserId: "igsid-1",
        ...overrides,
      })
      .returning({ id: schema.leads.id })
      .get().id;
  }

  function insertInboundMessage(leadId: number, sentAt: string) {
    db.insert(schema.messages)
      .values({ leadId, direction: "inbound", channel: "api", content: "oi", status: "delivered", sentAt })
      .run();
  }

  it("sends via the Graph API and records the outbound message within the messaging window", async () => {
    const leadId = createLead();
    insertInboundMessage(leadId, new Date().toISOString());
    sendApiMessage.mockResolvedValueOnce({ providerMessageId: "mid-out-1" });

    await apiOutreach.sendApiMessage({ leadId, content: "Oi, tudo bem?" });

    const message = db.select().from(schema.messages).where(eq(schema.messages.providerMessageId, "mid-out-1")).get();
    expect(message?.direction).toBe("outbound");
    expect(message?.channel).toBe("api");
  });

  it("closes the window instead of sending once 24h since the last inbound message have passed", async () => {
    const leadId = createLead();
    insertInboundMessage(leadId, new Date(Date.now() - 25 * 60 * 60_000).toISOString());

    await apiOutreach.sendApiMessage({ leadId, content: "Oi?" });

    expect(sendApiMessage).not.toHaveBeenCalled();
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.channelState).toBe("api_window_closed");
  });

  it("is a no-op when channel ownership is not with the API", async () => {
    const leadId = createLead({ channelState: "waiting_inbound_reply" });

    await apiOutreach.sendApiMessage({ leadId, content: "Oi?" });

    expect(sendApiMessage).not.toHaveBeenCalled();
  });

  it("is a no-op for a do-not-contact lead", async () => {
    const leadId = createLead({ doNotContact: true, channelState: "do_not_contact" });

    await apiOutreach.sendApiMessage({ leadId, content: "Oi?" });

    expect(sendApiMessage).not.toHaveBeenCalled();
  });
});
