import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const connectOverCDP = vi.fn();
vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: (...args: unknown[]) => connectOverCDP(...args) },
}));

const scrapeProfile = vi.fn();
vi.mock("@/integrations/browser/profile", () => ({ scrapeProfile: (...args: unknown[]) => scrapeProfile(...args) }));

const getBusinessConfig = vi.fn();
vi.mock("@/lib/business-config-core", () => ({ getBusinessConfig: () => getBusinessConfig() }));

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
  icpKeywords: ["moda", "roupas"],
  affiliateTopics: [],
  geography: "BR",
};

function fakePage() {
  return {
    url: () => "https://www.instagram.com/loja_teste/",
    goto: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    on: vi.fn(),
  };
}

function fakeBrowser(page: ReturnType<typeof fakePage>) {
  const context = { newPage: vi.fn(async () => page) };
  return { isConnected: () => true, contexts: () => [context] };
}

describe("discoverProfile", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let discovery: typeof import("./discovery");
  let schema: typeof import("@/db/schema");
  let resetBrowserSessionForTests: typeof import("@/integrations/browser/session").resetBrowserSessionForTests;

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    process.env.CHROME_CDP_URL = "http://127.0.0.1:9222";
    process.env.CHROME_PROFILE_DIR = "/tmp/chrome-profile";
    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    discovery = await import("./discovery");
    ({ resetBrowserSessionForTests } = await import("@/integrations/browser/session"));
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM jobs");
    sqlite.exec("DELETE FROM leads");
    sqlite.exec("DELETE FROM system_state");
    connectOverCDP.mockReset();
    scrapeProfile.mockReset();
    getBusinessConfig.mockReset();
    getBusinessConfig.mockReturnValue(business);
    resetBrowserSessionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getBusinessConfig.mockReturnValue(business);
  });

  it("scrapes, scores and creates a new lead, then chains into send_browser_dm", async () => {
    connectOverCDP.mockResolvedValueOnce(fakeBrowser(fakePage()));
    scrapeProfile.mockResolvedValueOnce({
      fullName: "Loja Teste",
      bio: "Loja de moda feminina",
      profileCategory: null,
      isPrivate: false,
      followerCount: 1200,
    });

    await discovery.discoverProfile(
      { instagramUsername: "loja_teste" },
      { id: 1, leadId: null, attempts: 1 },
    );

    const lead = db.select().from(schema.leads).where(eq(schema.leads.instagramUsername, "loja_teste")).get();
    expect(lead).toBeDefined();
    expect(lead?.icpScore).toBe(25);
    expect(lead?.followerCount).toBe(1200);

    const jobs = sqlite.prepare("SELECT type, idempotency_key FROM jobs").all() as {
      type: string;
      idempotency_key: string;
    }[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe("send_browser_dm");
    expect(jobs[0].idempotency_key).toBe(`send_browser_dm:${lead?.id}`);
  });

  it("does not chain into send_browser_dm for a do-not-contact lead", async () => {
    db.insert(schema.leads)
      .values({ instagramUsername: "bloqueado", doNotContact: true, channelState: "do_not_contact" })
      .run();

    await discovery.discoverProfile(
      { instagramUsername: "bloqueado" },
      { id: 2, leadId: null, attempts: 1 },
    );

    expect(connectOverCDP).not.toHaveBeenCalled();
    const jobs = sqlite.prepare("SELECT count(*) as count FROM jobs").get() as { count: number };
    expect(jobs.count).toBe(0);
  });

  it("records browser_unavailable, rethrows and pauses the system when the CDP connection fails", async () => {
    connectOverCDP.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      discovery.discoverProfile({ instagramUsername: "loja_offline" }, { id: 3, leadId: null, attempts: 1 }),
    ).rejects.toThrow();

    const eventTypes = sqlite
      .prepare("SELECT type FROM events ORDER BY id ASC")
      .all() as { type: string }[];
    expect(eventTypes.map((e) => e.type)).toEqual(["browser_unavailable", "circuit_breaker_tripped"]);

    const state = sqlite.prepare("SELECT paused FROM system_state WHERE id = 1").get() as {
      paused: number;
    };
    expect(state.paused).toBe(1);
  });
});
