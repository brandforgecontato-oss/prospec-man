import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("isMonthlyBudgetExceeded", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let budget: typeof import("./budget");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    budget = await import("./budget");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM ai_calls");
  });

  function recordCall(costUsdMicros: number, createdAt: string) {
    db.insert(schema.aiCalls)
      .values({
        model: "gpt-test",
        purpose: "decide_reply",
        promptTokens: 100,
        completionTokens: 100,
        costUsd: costUsdMicros,
        createdAt,
      })
      .run();
  }

  it("is false when spend this month is below the budget", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    recordCall(5_000_000, "2026-03-01T00:00:00.000Z"); // $5
    expect(budget.isMonthlyBudgetExceeded(10, now)).toBe(false);
  });

  it("is true once spend this month reaches the budget", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    recordCall(6_000_000, "2026-03-01T00:00:00.000Z");
    recordCall(4_000_000, "2026-03-10T00:00:00.000Z");
    expect(budget.isMonthlyBudgetExceeded(10, now)).toBe(true);
  });

  it("ignores spend from a previous month", () => {
    const now = new Date("2026-03-02T00:00:00.000Z");
    recordCall(50_000_000, "2026-02-28T23:59:59.000Z");
    expect(budget.isMonthlyBudgetExceeded(10, now)).toBe(false);
  });
});
