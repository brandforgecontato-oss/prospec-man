import { describe, expect, it } from "vitest";

import { parseFollowerCount, parseHeaderBlob } from "./profile";

describe("parseHeaderBlob", () => {
  // Real innerText() output from `header section:last-of-type` against
  // @instagram's actual profile page (captured during the dry-run,
  // prompt.MD "Testes" nível 2) — name, stats and bio all merged together.
  const realBlob =
    "instagram\nInstagram\n8.607 posts\n686 mi seguidores\n303 seguindo\n" +
    "Discover what's new on Instagram 🔎✨\nhelp.instagram.com e mais 2";

  it("splits the real merged blob into name, follower count and bio", () => {
    const result = parseHeaderBlob(realBlob);

    expect(result.fullName).toBe("Instagram");
    expect(result.followerCount).toBe(686_000_000);
    expect(result.bio).toBe("Discover what's new on Instagram 🔎✨\nhelp.instagram.com e mais 2");
  });

  it("still gets the display name right when it equals the username (e.g. @instagram itself)", () => {
    // realBlob's first two lines are "instagram" (username echo) then
    // "Instagram" (display name) — the parser must not confuse the two.
    const result = parseHeaderBlob(realBlob);
    expect(result.fullName).toBe("Instagram");
  });

  it("returns nulls for an empty blob", () => {
    expect(parseHeaderBlob("")).toEqual({
      fullName: null,
      bio: null,
      followerCount: null,
    });
  });

  it("returns a null bio when there is nothing after the stats", () => {
    const blob = "loja\nLoja Exemplo\n10 posts\n500 seguidores\n20 seguindo";
    const result = parseHeaderBlob(blob);
    expect(result.bio).toBeNull();
    expect(result.followerCount).toBe(500);
  });
});

describe("parseFollowerCount", () => {
  it("parses the Portuguese 'mi' (millions) suffix correctly, not by accident", () => {
    expect(parseFollowerCount("686 mi seguidores")).toBe(686_000_000);
  });

  it("parses 'mil' (thousands)", () => {
    expect(parseFollowerCount("12,5 mil seguidores")).toBe(12_500);
  });

  it("parses English 'k' and 'm' suffixes", () => {
    expect(parseFollowerCount("12k followers")).toBe(12_000);
    expect(parseFollowerCount("3m followers")).toBe(3_000_000);
  });

  it("parses a plain number with thousands separator", () => {
    expect(parseFollowerCount("1.234 seguidores")).toBe(1_234);
  });

  it("returns null for null input", () => {
    expect(parseFollowerCount(null)).toBeNull();
  });
});
