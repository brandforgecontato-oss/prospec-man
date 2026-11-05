import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("assignVariantForVariable", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let assign: typeof import("./assign");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    assign = await import("./assign");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM events");
    sqlite.exec("DELETE FROM experiment_assignments");
    sqlite.exec("DELETE FROM experiments");
    sqlite.exec("DELETE FROM leads");
  });

  function createLead(username: string) {
    return db
      .insert(schema.leads)
      .values({ instagramUsername: username })
      .returning({ id: schema.leads.id })
      .get().id;
  }

  function createExperiment(variants: Array<{ key: string; label: string; weight: number; isControl: boolean }>) {
    return db
      .insert(schema.experiments)
      .values({ name: "teste", variable: "opening_message", status: "running", variants })
      .returning({ id: schema.experiments.id })
      .get().id;
  }

  it("returns null when no experiment is running for the variable", () => {
    const leadId = createLead("sem_experimento");

    expect(assign.assignVariantForVariable("opening_message", leadId, "replied")).toBeNull();
  });

  it("assigns a lead to a variant and records the assignment and event", () => {
    createExperiment([
      { key: "control", label: "Controle", weight: 100, isControl: true },
      { key: "challenger", label: "Desafiante", weight: 0, isControl: false },
    ]);
    const leadId = createLead("lead_1");

    const result = assign.assignVariantForVariable("opening_message", leadId, "replied");

    expect(result).toEqual({ variant: "control", isControl: true });
    const assignment = db
      .select()
      .from(schema.experimentAssignments)
      .where(eq(schema.experimentAssignments.leadId, leadId))
      .get();
    expect(assignment?.variant).toBe("control");

    const event = sqlite
      .prepare("SELECT type FROM events WHERE lead_id = ? ORDER BY id DESC LIMIT 1")
      .get(leadId) as { type: string };
    expect(event.type).toBe("experiment_variant_assigned");
  });

  it("is idempotent — a lead already assigned keeps its variant", () => {
    createExperiment([
      { key: "control", label: "Controle", weight: 0, isControl: true },
      { key: "challenger", label: "Desafiante", weight: 100, isControl: false },
    ]);
    const leadId = createLead("lead_2");

    const first = assign.assignVariantForVariable("opening_message", leadId, "replied");
    const second = assign.assignVariantForVariable("opening_message", leadId, "replied");

    expect(first).toEqual(second);
  });

  it("ignores experiments that are not running", () => {
    const experimentId = createExperiment([
      { key: "control", label: "Controle", weight: 100, isControl: true },
      { key: "challenger", label: "Desafiante", weight: 0, isControl: false },
    ]);
    db.update(schema.experiments).set({ status: "paused" }).where(eq(schema.experiments.id, experimentId)).run();
    const leadId = createLead("lead_3");

    expect(assign.assignVariantForVariable("opening_message", leadId, "replied")).toBeNull();
  });
});
