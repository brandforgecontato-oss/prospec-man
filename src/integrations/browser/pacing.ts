import type { OperatingWindow } from "./config";

function getHourInTimezone(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour + minute / 60;
}

export function isWithinOperatingHours(
  now: Date,
  window: OperatingWindow,
  timezone: string,
): boolean {
  const hour = getHourInTimezone(now, timezone);
  return hour >= window.startHour && hour < window.endHour;
}

function getDateKeyInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** Whether `a` and `b` fall on the same calendar day in `timezone` — used for the daily DM cap. */
export function isSameOperatingDay(a: Date, b: Date, timezone: string): boolean {
  return getDateKeyInTimezone(a, timezone) === getDateKeyInTimezone(b, timezone);
}

/** Whole calendar days between `start` and `now` in `timezone` — feeds warmupDailyLimit. */
export function operatingDaysSince(start: Date, now: Date, timezone: string): number {
  const startKey = getDateKeyInTimezone(start, timezone);
  const nowKey = getDateKeyInTimezone(now, timezone);
  const startDate = new Date(`${startKey}T00:00:00Z`);
  const nowDate = new Date(`${nowKey}T00:00:00Z`);
  const diffMs = nowDate.getTime() - startDate.getTime();
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

export function randomIntBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

/** Random wait between two outbound DMs, per MIN/MAX_SECONDS_BETWEEN_DMS. */
export function randomDelayMsBetweenDms(minSeconds: number, maxSeconds: number): number {
  return randomIntBetween(minSeconds, maxSeconds) * 1000;
}

/** Per-character typing delay, in ms, for human-like typing. */
export function randomTypingDelayMs(): number {
  return randomIntBetween(40, 140);
}

/** Pause after typing and before pressing send. */
export function randomPauseBeforeSendMs(): number {
  return randomIntBetween(400, 1600);
}

/**
 * Daily DM cap during warmup: 5/day in week 1, +5 per following week, capped at steadyStateLimit.
 * daysSinceStart is 0-indexed (0 = first day of the campaign).
 */
export function warmupDailyLimit(daysSinceStart: number, steadyStateLimit: number): number {
  const week = Math.floor(Math.max(0, daysSinceStart) / 7);
  const rampLimit = 5 + week * 5;
  return Math.min(rampLimit, steadyStateLimit);
}
