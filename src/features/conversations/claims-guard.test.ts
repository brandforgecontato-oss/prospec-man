import { describe, expect, it } from "vitest";

import { violatesUnverifiedClaims } from "./claims-guard";

describe("violatesUnverifiedClaims", () => {
  it("flags a reply that states an unverified claim verbatim", () => {
    const claim = violatesUnverifiedClaims(
      "A gente já ajudou mais de 500 lojas a triplicar as vendas!",
      ["ajudou mais de 500 lojas"],
    );
    expect(claim).toBe("ajudou mais de 500 lojas");
  });

  it("is case-insensitive", () => {
    const claim = violatesUnverifiedClaims("Já TRIPLICAMOS o faturamento de clientes", ["triplicamos o faturamento"]);
    expect(claim).toBe("triplicamos o faturamento");
  });

  it("returns null when the reply doesn't touch any unverified claim", () => {
    const claim = violatesUnverifiedClaims("Oi! Curti seu trabalho, posso te contar como funciona?", [
      "ajudou mais de 500 lojas",
    ]);
    expect(claim).toBeNull();
  });

  it("returns null when there are no unverified claims configured", () => {
    expect(violatesUnverifiedClaims("qualquer coisa", [])).toBeNull();
  });
});
