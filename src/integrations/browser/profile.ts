import type { Page } from "playwright-core";

export interface ScrapedProfile {
  fullName: string | null;
  bio: string | null;
  profileCategory: string | null;
  isPrivate: boolean;
  followerCount: number | null;
}

async function readText(page: Page, selector: string): Promise<string | null> {
  try {
    const text = await page.locator(selector).first().innerText({ timeout: 3000 });
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/** "8.607 posts" / "686 mi seguidores" / "303 seguindo" / English equivalents. */
const STAT_LINE = /^[\d.,]+\s*(mil|mi|k|m)?\s+(posts?|seguidores?|followers?|seguindo|following)$/i;
const FOLLOWERS_STAT = /seguidores?|followers?/i;

export function parseFollowerCount(raw: string | null): number | null {
  if (!raw) return null;
  // "mi" (milhões) must be tried before the single-letter "m" alternative,
  // or "mi" would match just its leading "m" and silently give the right
  // order of magnitude by coincidence instead of by design.
  const match = /([\d.,]+)\s*(mil|mi|k|m)?/i.exec(raw);
  if (!match) return null;
  const numeric = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === "mil" || suffix === "k") return Math.round(numeric * 1_000);
  if (suffix === "mi" || suffix === "m") return Math.round(numeric * 1_000_000);
  return Math.round(numeric);
}

export interface ParsedHeaderBlob {
  fullName: string | null;
  bio: string | null;
  followerCount: number | null;
}

/**
 * `header section:last-of-type` (the only selector that reliably found
 * anything against a real profile during the dry-run, prompt.MD "Testes"
 * nível 2) returns name, stats and bio all merged into one `innerText()`
 * blob rather than as separate elements — e.g. for a real public profile:
 * "instagram\nInstagram\n8.607 posts\n686 mi seguidores\n303 seguindo\n
 * Discover what's new on Instagram 🔎✨\nhelp.instagram.com e mais 2".
 * Splitting on the stat lines (recognizable by their "N posts/seguidores/
 * seguindo" shape) separates the three pieces without needing a narrower,
 * more brittle selector for each one. The display name is whichever line
 * sits right before the stats — the username itself is usually echoed as
 * its own line before that, so this doesn't need to know the username to
 * tell them apart (and a profile whose display name equals its username,
 * like @instagram's own account, still comes out right).
 */
export function parseHeaderBlob(blob: string): ParsedHeaderBlob {
  const lines = blob
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const statIndexes = lines.reduce<number[]>((acc, line, index) => {
    if (STAT_LINE.test(line)) acc.push(index);
    return acc;
  }, []);

  const firstStatIndex = statIndexes.length > 0 ? statIndexes[0] : lines.length;
  const lastStatIndex = statIndexes.length > 0 ? statIndexes[statIndexes.length - 1] : -1;

  // The real blob echoes the username as its own line before the display
  // name (e.g. "instagram\nInstagram\n8.607 posts\n..."), so the display
  // name is whichever line sits right before the stats — not "any line
  // that isn't the username", which would wrongly drop a display name that
  // happens to match the username too (as it does for @instagram itself).
  const fullName = firstStatIndex > 0 ? lines[firstStatIndex - 1] : null;

  const bioLines = lines.slice(lastStatIndex + 1);
  const bio = bioLines.length > 0 ? bioLines.join("\n") : null;

  const followersLine = statIndexes.map((i) => lines[i]).find((line) => FOLLOWERS_STAT.test(line));
  const followerCount = parseFollowerCount(followersLine ?? null);

  return { fullName, bio, followerCount };
}

/**
 * Scrapes public signals from the profile page already open in `page`.
 * Targets the header landmark and accessible text rather than generated CSS
 * classes, per prompt.MD's preference for stable references. Confirmed
 * against a real profile during the dry-run (prompt.MD "Testes", nível 2) —
 * `header h1, header h2` and a separate followers-link selector both came
 * back empty/wrong against the real markup, so name/bio/followers are all
 * derived from the one blob that did work (`parseHeaderBlob`) instead.
 */
export async function scrapeProfile(page: Page): Promise<ScrapedProfile> {
  const headerBlob = await readText(page, "header section:last-of-type");
  const { fullName, bio, followerCount } = headerBlob
    ? parseHeaderBlob(headerBlob)
    : { fullName: null, bio: null, followerCount: null };

  const privacyNotice = await readText(
    page,
    'main:has-text("This Account is Private"), main:has-text("Esta conta é privada")',
  );

  let profileCategory: string | null = null;
  try {
    profileCategory = await page
      .getByText(/^(Criador|Creator|Negócio local|Local business|Empresa|Business)/i)
      .first()
      .innerText({ timeout: 1500 });
  } catch {
    profileCategory = null;
  }

  return {
    fullName,
    bio,
    profileCategory,
    isPrivate: privacyNotice !== null,
    followerCount,
  };
}
