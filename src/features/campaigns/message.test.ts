import { describe, expect, it } from "vitest";

import { buildOpeningMessage } from "./message";

describe("buildOpeningMessage", () => {
  it("uses the first name and an ICP keyword found in the bio as the hook", () => {
    const message = buildOpeningMessage({
      fullName: "Maria Souza",
      instagramUsername: "loja_maria",
      bio: "Loja de moda feminina em SP",
      profileCategory: null,
      icpKeywords: ["moda", "acessórios"],
    });
    expect(message).toContain("Maria");
    expect(message.toLowerCase()).toContain("moda");
  });

  it("falls back to the @handle when there is no full name", () => {
    const message = buildOpeningMessage({
      fullName: null,
      instagramUsername: "loja_maria",
      bio: null,
      profileCategory: null,
      icpKeywords: ["moda"],
    });
    expect(message).toContain("@loja_maria");
  });

  it("never mentions the company or a claim — that comes later, per prompt.MD", () => {
    const message = buildOpeningMessage({
      fullName: "Maria",
      instagramUsername: "loja_maria",
      bio: "Loja de moda",
      profileCategory: null,
      icpKeywords: ["moda"],
    });
    expect(message.toLowerCase()).not.toContain("brandforge");
  });

  it("uses the direct_question variant when assigned by an experiment", () => {
    const message = buildOpeningMessage({
      fullName: "Maria",
      instagramUsername: "loja_maria",
      bio: "Loja de moda",
      profileCategory: null,
      icpKeywords: ["moda"],
      variant: "direct_question",
    });
    expect(message).toContain("pergunta rápida");
  });

  it("falls back to the personal_hook wording for an unknown variant", () => {
    const message = buildOpeningMessage({
      fullName: "Maria",
      instagramUsername: "loja_maria",
      bio: "Loja de moda",
      profileCategory: null,
      icpKeywords: ["moda"],
      variant: "something_unrecognized",
    });
    expect(message).toContain("curti");
  });
});
