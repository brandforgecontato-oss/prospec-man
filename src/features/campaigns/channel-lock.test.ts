import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("tryTransitionChannelState", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let channelLock: typeof import("./channel-lock");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    channelLock = await import("./channel-lock");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM leads");
  });

  function createLead(overrides: Partial<typeof schema.leads.$inferInsert> = {}) {
    return db
      .insert(schema.leads)
      .values({ instagramUsername: "loja_teste", ...overrides })
      .returning({ id: schema.leads.id })
      .get().id;
  }

  it("moves the lead when it is currently in one of the expected `from` states", () => {
    const leadId = createLead({ channelState: "browser_contact_pending" });

    const moved = channelLock.tryTransitionChannelState(leadId, "browser_contact_pending", "browser_contact_sent");

    expect(moved).toBe(true);
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.channelState).toBe("browser_contact_sent");
  });

  it("accepts an array of `from` states", () => {
    const leadId = createLead({ channelState: "browser_contact_sent" });

    const moved = channelLock.tryTransitionChannelState(
      leadId,
      ["waiting_inbound_reply", "browser_contact_sent"],
      "api_active",
    );

    expect(moved).toBe(true);
  });

  it("loses the race and leaves the row untouched when the current state doesn't match", () => {
    const leadId = createLead({ channelState: "blocked" });

    const moved = channelLock.tryTransitionChannelState(leadId, "browser_contact_pending", "browser_contact_sent");

    expect(moved).toBe(false);
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    expect(lead?.channelState).toBe("blocked");
  });

  it("applies extra field updates only when the transition succeeds", () => {
    const winner = createLead({ channelState: "browser_contact_pending", pipelineStage: "contacted" });
    const loser = createLead({ instagramUsername: "outro", channelState: "blocked", pipelineStage: "contacted" });

    channelLock.tryTransitionChannelState(winner, "browser_contact_pending", "browser_contact_sent", {
      pipelineStage: "replied",
    });
    channelLock.tryTransitionChannelState(loser, "browser_contact_pending", "browser_contact_sent", {
      pipelineStage: "replied",
    });

    const winnerLead = db.select().from(schema.leads).where(eq(schema.leads.id, winner)).get();
    const loserLead = db.select().from(schema.leads).where(eq(schema.leads.id, loser)).get();
    expect(winnerLead?.pipelineStage).toBe("replied");
    expect(loserLead?.pipelineStage).toBe("contacted");
  });
});
