import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("circuit breaker", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let breaker: typeof import("./circuit-breaker");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    breaker = await import("./circuit-breaker");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM system_state");
  });

  it("starts not paused", () => {
    expect(breaker.isSystemPaused()).toBe(false);
    expect(breaker.getSystemState()).toEqual({ paused: false, pausedReason: null, pausedAt: null });
  });

  it("pauses with a reason and records an event", () => {
    breaker.pauseSystem("Orçamento excedido");

    expect(breaker.isSystemPaused()).toBe(true);
    expect(breaker.getSystemState().pausedReason).toBe("Orçamento excedido");

    const event = db
      .select()
      .from(schema.events)
      .where(eq(schema.events.type, "circuit_breaker_tripped"))
      .get();
    expect(event).toBeDefined();
  });

  it("keeps the original reason when paused again for a different cause", () => {
    breaker.pauseSystem("primeira causa");
    breaker.pauseSystem("segunda causa");

    expect(breaker.getSystemState().pausedReason).toBe("primeira causa");
  });

  it("resumes and records an event", () => {
    breaker.pauseSystem("motivo");
    breaker.resumeSystem();

    expect(breaker.isSystemPaused()).toBe(false);
    const event = db.select().from(schema.events).where(eq(schema.events.type, "system_resumed")).get();
    expect(event).toBeDefined();
  });
});
