import { beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("computeVariantMetrics", () => {
  let db: typeof import("@/db/client").db;
  let sqlite: typeof import("@/db/client").sqlite;
  let schema: typeof import("@/db/schema");
  let metrics: typeof import("./metrics");

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";

    const client = await import("@/db/client");
    db = client.db;
    sqlite = client.sqlite;

    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    migrate(db, { migrationsFolder: "./src/db/migrations" });

    schema = await import("@/db/schema");
    metrics = await import("./metrics");
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM experiment_assignments");
    sqlite.exec("DELETE FROM experiments");
    sqlite.exec("DELETE FROM leads");
  });

  function createLead(username: string, pipelineStage: (typeof schema.LEAD_PIPELINE_STAGES)[number]) {
    return db
      .insert(schema.leads)
      .values({ instagramUsername: username, pipelineStage })
      .returning({ id: schema.leads.id })
      .get().id;
  }

  function createExperiment() {
    return db
      .insert(schema.experiments)
      .values({
        name: "teste",
        variable: "opening_message",
        status: "running",
        variants: [
          { key: "control", label: "Controle", weight: 50, isControl: true },
          { key: "challenger", label: "Desafiante", weight: 50, isControl: false },
        ],
      })
      .returning({ id: schema.experiments.id })
      .get().id;
  }

  function assign(experimentId: number, leadId: number, variant: string, isControl: boolean) {
    db.insert(schema.experimentAssignments).values({ experimentId, leadId, variant, isControl }).run();
  }

  it("counts sample size and conversions reached-at-or-past each milestone", () => {
    const experimentId = createExperiment();

    const repliedLead = createLead("replied", "replied");
    const closedLead = createLead("closed", "closed");
    const discoveredLead = createLead("still_contacted", "contacted");
    assign(experimentId, repliedLead, "control", true);
    assign(experimentId, closedLead, "control", true);
    assign(experimentId, discoveredLead, "challenger", false);

    const result = metrics.computeVariantMetrics(experimentId);
    const control = result.find((r) => r.key === "control")!;
    const challenger = result.find((r) => r.key === "challenger")!;

    expect(control.sampleSize).toBe(2);
    expect(control.conversionsByMilestone.contacted).toBe(2);
    expect(control.conversionsByMilestone.replied).toBe(2);
    expect(control.conversionsByMilestone.active_customer).toBe(1);

    expect(challenger.sampleSize).toBe(1);
    expect(challenger.conversionsByMilestone.contacted).toBe(1);
    expect(challenger.conversionsByMilestone.replied).toBe(0);
  });

  it("returns an empty list when the experiment has no assignments", () => {
    const experimentId = createExperiment();

    expect(metrics.computeVariantMetrics(experimentId)).toEqual([]);
  });
});
