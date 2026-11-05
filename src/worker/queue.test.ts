import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as Db, sqlite as Sqlite } from "@/db/client";

describe("worker queue", () => {
  let db: typeof Db;
  let sqlite: typeof Sqlite;
  let queue: typeof import("./queue");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    queue = await import("./queue");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM jobs");
  });

  const backoffOptions = { maxAttempts: 3, backoffBaseMs: 1000, backoffMaxMs: 60_000 };

  it("enqueues a job as pending", () => {
    const id = queue.enqueueJob({
      type: "discover_profile",
      payload: { username: "loja_teste" },
      idempotencyKey: "discover:loja_teste",
    });

    const claimed = queue.claimNextJob();
    expect(claimed?.id).toBe(id);
    expect(claimed?.type).toBe("discover_profile");
    expect(claimed?.attempts).toBe(1);
  });

  it("is idempotent: same key does not create a second job", () => {
    const first = queue.enqueueJob({
      type: "discover_profile",
      payload: { username: "loja_teste" },
      idempotencyKey: "discover:loja_teste",
    });
    const second = queue.enqueueJob({
      type: "discover_profile",
      payload: { username: "loja_teste" },
      idempotencyKey: "discover:loja_teste",
    });

    expect(second).toBe(first);
    const rows = sqlite.prepare("SELECT count(*) as count FROM jobs").get() as {
      count: number;
    };
    expect(rows.count).toBe(1);
  });

  it("does not claim jobs scheduled in the future", () => {
    queue.enqueueJob({
      type: "follow_up",
      payload: {},
      idempotencyKey: "follow_up:1",
      scheduledFor: new Date(Date.now() + 60_000),
    });

    expect(queue.claimNextJob()).toBeUndefined();
  });

  it("does not reclaim a job that is already running", () => {
    queue.enqueueJob({
      type: "send_browser_dm",
      payload: {},
      idempotencyKey: "dm:1",
    });

    const first = queue.claimNextJob();
    const second = queue.claimNextJob();

    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });

  it("claims the oldest due job first", () => {
    const older = queue.enqueueJob({
      type: "follow_up",
      payload: {},
      idempotencyKey: "follow_up:older",
      scheduledFor: new Date(Date.now() - 10_000),
    });
    queue.enqueueJob({
      type: "follow_up",
      payload: {},
      idempotencyKey: "follow_up:newer",
      scheduledFor: new Date(Date.now() - 5_000),
    });

    const claimed = queue.claimNextJob();
    expect(claimed?.id).toBe(older);
  });

  it("marks a job completed", () => {
    const id = queue.enqueueJob({
      type: "poll_webhook_inbox",
      payload: {},
      idempotencyKey: "poll:1",
    });
    queue.claimNextJob();
    queue.completeJob(id);

    const row = sqlite.prepare("SELECT status FROM jobs WHERE id = ?").get(id) as {
      status: string;
    };
    expect(row.status).toBe("completed");
  });

  it("reschedules a failed job with backoff while under maxAttempts", () => {
    const id = queue.enqueueJob({
      type: "send_api_message",
      payload: {},
      idempotencyKey: "api:1",
    });
    const claimed = queue.claimNextJob()!;
    queue.failJob(id, claimed.attempts, new Error("boom"), backoffOptions);

    const row = sqlite
      .prepare("SELECT status, last_error, scheduled_for FROM jobs WHERE id = ?")
      .get(id) as { status: string; last_error: string; scheduled_for: string };
    expect(row.status).toBe("pending");
    expect(row.last_error).toBe("boom");
    expect(new Date(row.scheduled_for).getTime()).toBeGreaterThan(Date.now());
  });

  it("moves a job to dead_letter once maxAttempts is reached", () => {
    const id = queue.enqueueJob({
      type: "send_api_message",
      payload: {},
      idempotencyKey: "api:2",
    });
    queue.failJob(id, backoffOptions.maxAttempts, new Error("still failing"), backoffOptions);

    const row = sqlite.prepare("SELECT status, last_error FROM jobs WHERE id = ?").get(id) as {
      status: string;
      last_error: string;
    };
    expect(row.status).toBe("dead_letter");
    expect(row.last_error).toBe("still failing");
  });

  it("reschedules a deferred job without counting it as a failure", () => {
    const id = queue.enqueueJob({
      type: "send_browser_dm",
      payload: {},
      idempotencyKey: "dm:defer:1",
    });
    queue.claimNextJob();
    const retryAt = new Date(Date.now() + 60_000);
    queue.rescheduleJob(id, retryAt);

    const row = sqlite
      .prepare("SELECT status, last_error, scheduled_for FROM jobs WHERE id = ?")
      .get(id) as { status: string; last_error: string | null; scheduled_for: string };
    expect(row.status).toBe("pending");
    expect(row.last_error).toBeNull();
    expect(new Date(row.scheduled_for).getTime()).toBe(retryAt.getTime());
  });

  it("requeues jobs stuck in running back to pending, and leaves other statuses alone", () => {
    const stuck = queue.enqueueJob({
      type: "send_browser_dm",
      payload: {},
      idempotencyKey: "dm:stuck",
    });
    queue.claimNextJob(); // moves `stuck` to running

    const untouched = queue.enqueueJob({
      type: "follow_up",
      payload: {},
      idempotencyKey: "follow_up:untouched",
      scheduledFor: new Date(Date.now() + 60_000),
    });

    const requeuedCount = queue.requeueOrphanedJobs();

    expect(requeuedCount).toBe(1);
    const stuckRow = sqlite.prepare("SELECT status FROM jobs WHERE id = ?").get(stuck) as { status: string };
    expect(stuckRow.status).toBe("pending");
    const untouchedRow = sqlite.prepare("SELECT status FROM jobs WHERE id = ?").get(untouched) as {
      status: string;
    };
    expect(untouchedRow.status).toBe("pending");
  });

  it("computes backoff that grows with attempts and respects the cap", () => {
    const small = queue.computeBackoffMs(1, 1000, 60_000);
    const large = queue.computeBackoffMs(10, 1000, 60_000);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThanOrEqual(1000);
    expect(large).toBeLessThanOrEqual(60_000);
  });
});
