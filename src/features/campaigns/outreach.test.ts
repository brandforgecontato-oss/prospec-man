import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const connectOverCDP = vi.fn();
vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: (...args: unknown[]) => connectOverCDP(...args) },
}));

const sendDirectMessage = vi.fn();
vi.mock("@/integrations/browser/dm", () => ({
  sendDirectMessage: (...args: unknown[]) => sendDirectMessage(...args),
}));

const getBusinessConfig = vi.fn();
vi.mock("@/lib/business-config-core", () => ({ getBusinessConfig: () => getBusinessConfig() }));

const tryTransitionChannelState = vi.fn();
vi.mock("./channel-lock", async () => {
  const actual = await vi.importActual<typeof import("./channel-lock")>("./channel-lock");
  return {
    tryTransitionChannelState: (...args: Parameters<typeof actual.tryTransitionChannelState>) =>
      tryTransitionChannelState(...args) ?? actual.tryTransitionChannelState(...args),
  };
});

const business = {
  ownerName: "Ana",
  ownerRole: "Fundadora",
  companyName: "BrandForge",
  companyWebsite: null,
  instagramHandle: "@brandforge",
  whatsappLink: "https://wa.me/5511999999999",
  affiliateGroupLink: null,
  onePLinePitch: "Ajudamos lojas a vender mais.",
  howItWorks: [],
  revenueModel: "",
  marketJargon: [],
  verifiedClaims: [],
  unverifiedClaims: [],
  icpSegments: [],
  icpKeywords: ["moda"],
  affiliateTopics: [],
  geography: "BR",
};

function fakePage() {
  return {
    url: () => "https://www.instagram.com/loja_teste/",
    goto: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    on: vi.fn(),
    screenshot: vi.fn(async () => undefined),
    ariaSnapshot: vi.fn(async () => "snapshot"),
  };
}

function fakeBrowser(page: ReturnType<typeof fakePage>) {
  const context = { newPage: vi.fn(async () => page) };
  return { isConnected: () => true, contexts: () => [context] };
}

describe("sendBrowserDm", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let outreach: typeof import("./outreach");
  let schema: typeof import("@/db/schema");
  let DeferJobError: typeof import("@/worker/defer-job-error").DeferJobError;
  let resetBrowserSessionForTests: typeof import("@/integrations/browser/session").resetBrowserSessionForTests;

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    process.env.CHROME_CDP_URL = "http://127.0.0.1:9222";
    process.env.CHROME_PROFILE_DIR = "/tmp/chrome-profile";
    process.env.OPERATING_HOURS = "00:00-23:59";
    process.env.OPERATING_TIMEZONE = "UTC";
    process.env.MIN_SECONDS_BETWEEN_DMS = "90";
    process.env.MAX_SECONDS_BETWEEN_DMS = "240";
    process.env.MAX_DMS_PER_DAY = "30";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    outreach = await import("./outreach");
    ({ DeferJobError } = await import("@/worker/defer-job-error"));
    ({ resetBrowserSessionForTests } = await import("@/integrations/browser/session"));
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM messages");
    sqlite.exec("DELETE FROM leads");
    sqlite.exec("DELETE FROM system_state");
    connectOverCDP.mockReset();
    sendDirectMessage.mockReset();
    getBusinessConfig.mockReset();
    getBusinessConfig.mockReturnValue(business);
    tryTransitionChannelState.mockReset();
    resetBrowserSessionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getBusinessConfig.mockReturnValue(business);
  });

  function createLead(overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
    return db
      .insert(schema.leads)
      .values({ instagramUsername: "loja_teste", bio: "Loja de moda", ...overrides })
      .returning({ id: schema.leads.id })
      .get().id;
  }

  it("sends the DM, records the message and moves the lead to waiting_inbound_reply", async () => {
    const leadId = createLead();
    connectOverCDP.mockResolvedValueOnce(fakeBrowser(fakePage()));
    sendDirectMessage.mockResolvedValueOnce(undefined);

    await outreach.sendBrowserDm({ leadId }, { id: 1, leadId, attempts: 1 });

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.channelState).toBe("waiting_inbound_reply");
    expect(lead?.pipelineStage).toBe("contacted");

    const message = db.select().from(schema.messages).where(eq(schema.messages.leadId, leadId)).get();
    expect(message?.status).toBe("sent");
    expect(message?.channel).toBe("browser");
  });

  it("is a no-op for a do-not-contact lead", async () => {
    const leadId = createLead({ doNotContact: true, channelState: "do_not_contact" });

    await outreach.sendBrowserDm({ leadId }, { id: 2, leadId, attempts: 1 });

    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it("is a no-op when the lead already moved past browser_contact_pending", async () => {
    const leadId = createLead({ channelState: "waiting_inbound_reply" });

    await outreach.sendBrowserDm({ leadId }, { id: 3, leadId, attempts: 1 });

    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it("defers instead of failing when the minimum interval since the last DM has not elapsed", async () => {
    const other = createLead({ instagramUsername: "outro" });
    db.update(schema.leads)
      .set({ channelState: "waiting_inbound_reply" })
      .where(eq(schema.leads.id, other))
      .run();
    db.insert(schema.messages)
      .values({
        leadId: other,
        direction: "outbound",
        channel: "browser",
        content: "oi",
        status: "sent",
        sentAt: new Date().toISOString(),
      })
      .run();

    const leadId = createLead({ instagramUsername: "loja_nova" });

    await expect(
      outreach.sendBrowserDm({ leadId }, { id: 4, leadId, attempts: 1 }),
    ).rejects.toBeInstanceOf(DeferJobError);
    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it("records dm_send_failed diagnostics and rethrows when sendDirectMessage fails", async () => {
    const leadId = createLead();
    connectOverCDP.mockResolvedValueOnce(fakeBrowser(fakePage()));
    sendDirectMessage.mockRejectedValueOnce(new Error("botão não encontrado"));

    await expect(
      outreach.sendBrowserDm({ leadId }, { id: 5, leadId, attempts: 1 }),
    ).rejects.toThrow("botão não encontrado");

    const event = sqlite
      .prepare("SELECT type FROM events WHERE lead_id = ? ORDER BY id DESC LIMIT 1")
      .get(leadId) as { type: string };
    expect(event.type).toBe("dm_send_failed");

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.channelState).toBe("browser_contact_pending");
  });

  it("does not send and records channel_lock_lost when another process wins the reservation first", async () => {
    const leadId = createLead();
    // Simulate a concurrent process (the webhook handoff, or the operator)
    // taking the channel between this job's read of the lead and its
    // reservation CAS.
    tryTransitionChannelState.mockReturnValueOnce(false);

    await outreach.sendBrowserDm({ leadId }, { id: 6, leadId, attempts: 1 });

    expect(connectOverCDP).not.toHaveBeenCalled();
    expect(sendDirectMessage).not.toHaveBeenCalled();

    const event = sqlite
      .prepare("SELECT type FROM events WHERE lead_id = ? ORDER BY id DESC LIMIT 1")
      .get(leadId) as { type: string };
    expect(event.type).toBe("channel_lock_lost");
  });
});
