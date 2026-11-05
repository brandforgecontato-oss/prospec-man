import { describe, expect, it } from "vitest";

import {
  isSameOperatingDay,
  isWithinOperatingHours,
  operatingDaysSince,
  parseOperatingHours,
  randomDelayMsBetweenDms,
  randomIntBetween,
  warmupDailyLimit,
} from ".";

describe("parseOperatingHours", () => {
  it("parses a valid HH:MM-HH:MM window", () => {
    expect(parseOperatingHours("09:00-20:00")).toEqual({ startHour: 9, endHour: 20 });
  });

  it("rejects a malformed window", () => {
    expect(() => parseOperatingHours("9h-20h")).toThrow();
  });

  it("rejects a window where the end is not after the start", () => {
    expect(() => parseOperatingHours("20:00-09:00")).toThrow();
  });
});

describe("isWithinOperatingHours", () => {
  const window = parseOperatingHours("09:00-20:00");

  it("is true inside the window", () => {
    const noon = new Date("2026-01-15T15:00:00Z"); // 12:00 in America/Sao_Paulo (UTC-3)
    expect(isWithinOperatingHours(noon, window, "America/Sao_Paulo")).toBe(true);
  });

  it("is false outside the window", () => {
    const midnight = new Date("2026-01-15T03:00:00Z"); // 00:00 in America/Sao_Paulo
    expect(isWithinOperatingHours(midnight, window, "America/Sao_Paulo")).toBe(false);
  });
});

describe("randomIntBetween / randomDelayMsBetweenDms", () => {
  it("stays within bounds", () => {
    for (let i = 0; i < 50; i++) {
      const value = randomIntBetween(90, 240);
      expect(value).toBeGreaterThanOrEqual(90);
      expect(value).toBeLessThanOrEqual(240);
    }
  });

  it("converts the DM interval to milliseconds", () => {
    for (let i = 0; i < 50; i++) {
      const ms = randomDelayMsBetweenDms(90, 240);
      expect(ms).toBeGreaterThanOrEqual(90_000);
      expect(ms).toBeLessThanOrEqual(240_000);
    }
  });
});

describe("isSameOperatingDay", () => {
  it("is true for two timestamps on the same calendar day in the timezone", () => {
    const morning = new Date("2026-01-15T12:00:00Z"); // 09:00 in America/Sao_Paulo
    const evening = new Date("2026-01-15T23:00:00Z"); // 20:00 in America/Sao_Paulo
    expect(isSameOperatingDay(morning, evening, "America/Sao_Paulo")).toBe(true);
  });

  it("is false across a day boundary in the timezone, even if the UTC day matches", () => {
    const lateNight = new Date("2026-01-16T02:00:00Z"); // 2026-01-15 23:00 in America/Sao_Paulo
    const nextMorning = new Date("2026-01-16T12:00:00Z"); // 2026-01-16 09:00 in America/Sao_Paulo
    expect(isSameOperatingDay(lateNight, nextMorning, "America/Sao_Paulo")).toBe(false);
  });
});

describe("operatingDaysSince", () => {
  it("is 0 on the same day", () => {
    const start = new Date("2026-01-15T12:00:00Z");
    const now = new Date("2026-01-15T20:00:00Z");
    expect(operatingDaysSince(start, now, "America/Sao_Paulo")).toBe(0);
  });

  it("counts whole calendar days elapsed in the timezone", () => {
    const start = new Date("2026-01-01T12:00:00Z");
    const now = new Date("2026-01-08T12:00:00Z");
    expect(operatingDaysSince(start, now, "America/Sao_Paulo")).toBe(7);
  });
});

describe("warmupDailyLimit", () => {
  it("starts at 5/day in the first week", () => {
    expect(warmupDailyLimit(0, 30)).toBe(5);
    expect(warmupDailyLimit(6, 30)).toBe(5);
  });

  it("adds 5 per following week", () => {
    expect(warmupDailyLimit(7, 30)).toBe(10);
    expect(warmupDailyLimit(14, 30)).toBe(15);
  });

  it("never exceeds the steady-state limit", () => {
    expect(warmupDailyLimit(365, 30)).toBe(30);
  });
});
