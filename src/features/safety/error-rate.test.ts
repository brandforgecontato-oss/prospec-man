import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("checkErrorRateAndMaybePause", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let errorRate: typeof import("./error-rate");
  let breaker: typeof import("./circuit-breaker");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    errorRate = await import("./error-rate");
    breaker = await import("./circuit-breaker");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM jobs");
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM system_state");
  });

  function insertDeadLetterJob(updatedAt: string) {
    db.insert(schema.jobs)
      .values({
        idempotencyKey: `job-${Math.random()}`,
        type: "discover_profile",
        status: "dead_letter",
        payload: {},
        updatedAt,
      })
      .run();
  }

  it("does not pause below the threshold", () => {
    const now = new Date();
    insertDeadLetterJob(now.toISOString());
    insertDeadLetterJob(now.toISOString());

    errorRate.checkErrorRateAndMaybePause(3, 15 * 60_000, now);

    expect(breaker.isSystemPaused()).toBe(false);
  });

  it("pauses once the threshold is reached within the window", () => {
    const now = new Date();
    insertDeadLetterJob(now.toISOString());
    insertDeadLetterJob(now.toISOString());
    insertDeadLetterJob(now.toISOString());

    errorRate.checkErrorRateAndMaybePause(3, 15 * 60_000, now);

    expect(breaker.isSystemPaused()).toBe(true);
  });

  it("ignores dead-letter jobs outside the window", () => {
    const now = new Date();
    const longAgo = new Date(now.getTime() - 60 * 60_000);
    insertDeadLetterJob(longAgo.toISOString());
    insertDeadLetterJob(longAgo.toISOString());
    insertDeadLetterJob(longAgo.toISOString());

    errorRate.checkErrorRateAndMaybePause(3, 15 * 60_000, now);

    expect(breaker.isSystemPaused()).toBe(false);
  });
});
