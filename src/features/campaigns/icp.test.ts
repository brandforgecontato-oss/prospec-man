import { describe, expect, it } from "vitest";

import { classifyDecisionMaker, computeIcpScore, computePriority } from "./icp";

describe("computeIcpScore", () => {
  it("scores 0 with no bio or no keywords", () => {
    expect(computeIcpScore(null, ["moda"])).toBe(0);
    expect(computeIcpScore("loja de moda feminina", [])).toBe(0);
  });

  it("counts case-insensitive keyword matches, capped at 100", () => {
    expect(computeIcpScore("Loja de MODA feminina, roupas e acessórios", ["moda", "roupas"])).toBe(50);
    expect(
      computeIcpScore("moda roupas acessorios bijuteria calcados", [
        "moda",
        "roupas",
        "acessorios",
        "bijuteria",
        "calcados",
      ]),
    ).toBe(100);
  });
});

describe("classifyDecisionMaker", () => {
  it("detects an owner from bio hints", () => {
    expect(classifyDecisionMaker("Dona da loja | Moda feminina", null)).toBe("owner");
    expect(classifyDecisionMaker("Founder @empresa", null)).toBe("owner");
  });

  it("detects a store account from bio or category", () => {
    expect(classifyDecisionMaker("Loja oficial de roupas", null)).toBe("store_account");
    expect(classifyDecisionMaker(null, "Negócio local")).toBe("unknown");
  });

  it("detects an employee from bio hints", () => {
    expect(classifyDecisionMaker("Atendimento e equipe comercial", null)).toBe("employee");
  });

  it("falls back to unknown", () => {
    expect(classifyDecisionMaker("Vida, café e viagens", null)).toBe("unknown");
    expect(classifyDecisionMaker(null, null)).toBe("unknown");
  });
});

describe("computePriority", () => {
  it("boosts owners more than store accounts, and unknown/employee get no boost", () => {
    expect(computePriority(50, "owner")).toBe(70);
    expect(computePriority(50, "store_account")).toBe(60);
    expect(computePriority(50, "employee")).toBe(50);
    expect(computePriority(50, "unknown")).toBe(50);
  });
});
