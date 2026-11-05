import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPricingCacheForTests } from "@/integrations/openai/pricing";

const runJsonCompletion = vi.fn();
vi.mock("@/integrations/openai/client", () => ({
  runJsonCompletion: (...args: unknown[]) => runJsonCompletion(...args),
}));

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
  verifiedClaims: ["atendimento personalizado"],
  unverifiedClaims: ["triplicamos suas vendas"],
  icpSegments: [],
  icpKeywords: ["moda"],
  affiliateTopics: [],
  geography: "BR",
};

describe("decideAndReply", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let decide: typeof import("./decide");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "gpt-main";
    process.env.OPENAI_MODEL_FAST = "gpt-fast";
    process.env.OPENAI_MONTHLY_BUDGET_USD = "100";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    decide = await import("./decide");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM jobs");
    sqlite.exec("DELETE FROM ai_calls");
    sqlite.exec("DELETE FROM messages");
    sqlite.exec("DELETE FROM leads");
    sqlite.exec("DELETE FROM system_state");
    runJsonCompletion.mockReset();
    getBusinessConfig.mockReset();
    getBusinessConfig.mockReturnValue(business);
    resetPricingCacheForTests({ "gpt-main": { promptPerMillionUsd: 1, completionPerMillionUsd: 1 }, "gpt-fast": { promptPerMillionUsd: 1, completionPerMillionUsd: 1 } });
    process.env.OPENAI_MONTHLY_BUDGET_USD = "100";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createLead(overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
    return db
      .insert(schema.leads)
      .values({ instagramUsername: "loja_teste", channelState: "api_active", pipelineStage: "replied", ...overrides })
      .returning({ id: schema.leads.id })
      .get().id;
  }

  it("classifies intent, decides and enqueues send_api_message with the drafted reply", async () => {
    const leadId = createLead();
    runJsonCompletion
      .mockResolvedValueOnce({ data: { intent: "asked_pricing" }, promptTokens: 100, completionTokens: 10 })
      .mockResolvedValueOnce({
        data: { action: "reply", reply: "Claro! Te explico certinho.", followUpNote: null },
        promptTokens: 200,
        completionTokens: 30,
      });

    await decide.decideAndReply({ leadId, latestInboundMessage: "Quanto custa?" }, { id: 1, leadId, attempts: 1 });

    const calls = db.select().from(schema.aiCalls).all();
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.purpose).sort()).toEqual(["classify_intent", "decide_reply"]);

    const job = db.select().from(schema.jobs).where(eq(schema.jobs.type, "send_api_message")).get();
    expect(job).toBeDefined();
    expect((job?.payload as { content: string }).content).toBe("Claro! Te explico certinho.");

    const decisionEvent = db.select().from(schema.events).where(eq(schema.events.type, "ai_reply_decided")).get();
    expect(decisionEvent).toBeDefined();
  });

  it("treats opt_out as an immediate, deterministic do-not-contact — no decision call, no reply", async () => {
    const leadId = createLead();
    runJsonCompletion.mockResolvedValueOnce({ data: { intent: "opt_out" }, promptTokens: 50, completionTokens: 5 });

    await decide.decideAndReply({ leadId, latestInboundMessage: "para de me chamar" }, { id: 2, leadId, attempts: 1 });

    expect(runJsonCompletion).toHaveBeenCalledTimes(1);
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.doNotContact).toBe(true);
    expect(lead?.channelState).toBe("do_not_contact");

    const job = db.select().from(schema.jobs).where(eq(schema.jobs.type, "send_api_message")).get();
    expect(job).toBeUndefined();
  });

  it("blocks a reply that states an unverified claim and escalates to a human instead of sending it", async () => {
    const leadId = createLead();
    runJsonCompletion
      .mockResolvedValueOnce({ data: { intent: "asked_pricing" }, promptTokens: 100, completionTokens: 10 })
      .mockResolvedValueOnce({
        data: { action: "reply", reply: "Sim, a gente triplicamos suas vendas certinho!", followUpNote: null },
        promptTokens: 200,
        completionTokens: 30,
      });

    await decide.decideAndReply({ leadId, latestInboundMessage: "Funciona mesmo?" }, { id: 3, leadId, attempts: 1 });

    const job = db.select().from(schema.jobs).where(eq(schema.jobs.type, "send_api_message")).get();
    expect(job).toBeUndefined();

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.channelState).toBe("human_review_required");

    const blockedEvent = db.select().from(schema.events).where(eq(schema.events.type, "ai_claim_blocked")).get();
    expect(blockedEvent).toBeDefined();
  });

  it("stops before calling OpenAI once the monthly budget is already spent", async () => {
    const leadId = createLead();
    db.insert(schema.aiCalls)
      .values({ model: "gpt-main", purpose: "decide_reply", promptTokens: 1, completionTokens: 1, costUsd: 200_000_000 })
      .run();

    await decide.decideAndReply({ leadId, latestInboundMessage: "Oi" }, { id: 4, leadId, attempts: 1 });

    expect(runJsonCompletion).not.toHaveBeenCalled();
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.channelState).toBe("human_review_required");

    const budgetEvent = db.select().from(schema.events).where(eq(schema.events.type, "budget_exceeded")).get();
    expect(budgetEvent).toBeDefined();

    // prompt.MD "Pausa automática diante de... estouro de orçamento" — not
    // just this lead, the whole system stops.
    const state = db.select().from(schema.systemState).where(eq(schema.systemState.id, 1)).get();
    expect(state?.paused).toBe(true);
  });

  it("appends the configured WhatsApp link (never the model's own text) on handoff_whatsapp", async () => {
    const leadId = createLead();
    runJsonCompletion
      .mockResolvedValueOnce({ data: { intent: "interested" }, promptTokens: 100, completionTokens: 10 })
      .mockResolvedValueOnce({
        data: { action: "handoff_whatsapp", reply: "Perfeito, bora fechar por lá!", followUpNote: null },
        promptTokens: 200,
        completionTokens: 30,
      });

    await decide.decideAndReply({ leadId, latestInboundMessage: "Quero fechar" }, { id: 5, leadId, attempts: 1 });

    const job = db.select().from(schema.jobs).where(eq(schema.jobs.type, "send_api_message")).get();
    expect((job?.payload as { content: string }).content).toBe(`Perfeito, bora fechar por lá! ${business.whatsappLink}`);

    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.pipelineStage).toBe("whatsapp_handoff");
  });

  it("is a no-op when channel ownership isn't with the API", async () => {
    const leadId = createLead({ channelState: "waiting_inbound_reply" });

    await decide.decideAndReply({ leadId, latestInboundMessage: "Oi" }, { id: 6, leadId, attempts: 1 });

    expect(runJsonCompletion).not.toHaveBeenCalled();
  });
});
