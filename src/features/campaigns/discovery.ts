import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events, leads } from "@/db/schema";
import { loadBrowserConfig } from "@/integrations/browser/config";
import { BrowserUnavailableError } from "@/integrations/browser/errors";
import { scrapeProfile } from "@/integrations/browser/profile";
import { gotoInstagram, withAgentPage } from "@/integrations/browser/session";
import { pauseSystem } from "@/features/safety/circuit-breaker";
import { getBusinessConfig } from "@/lib/business-config-core";
import type { JobContext } from "@/worker/handlers";
import { enqueueJob } from "@/worker/queue";

import { classifyDecisionMaker, computeIcpScore, computePriority } from "./icp";

export interface DiscoverProfilePayload {
  instagramUsername: string;
}

function parsePayload(payload: unknown): DiscoverProfilePayload {
  const data = payload as Partial<DiscoverProfilePayload> | null;
  const instagramUsername = data?.instagramUsername?.trim().replace(/^@/, "");
  if (!instagramUsername) {
    throw new Error("discover_profile: payload.instagramUsername ausente");
  }
  return { instagramUsername };
}

/**
 * Scrapes a known Instagram username (from the manual "/leads/novo" form
 * today; a keyword/hashtag crawler is out of scope for this step — see
 * CLAUDE.md), qualifies it against the ICP, dedupes/checks do-not-contact,
 * and — if eligible — chains into `send_browser_dm`.
 * Funil A, passos 1-4 do prompt.MD.
 */
export async function discoverProfile(payload: unknown, context: JobContext): Promise<void> {
  const { instagramUsername } = parsePayload(payload);
  const business = getBusinessConfig();
  const browserConfig = loadBrowserConfig();

  const existing = db
    .select()
    .from(leads)
    .where(eq(leads.instagramUsername, instagramUsername))
    .get();

  if (
    existing?.doNotContact ||
    existing?.channelState === "blocked" ||
    existing?.channelState === "do_not_contact"
  ) {
    return;
  }

  let scraped;
  try {
    scraped = await withAgentPage(browserConfig, async (agentPage) => {
      await gotoInstagram(agentPage, `https://www.instagram.com/${instagramUsername}/`);
      return scrapeProfile(agentPage.page);
    });
  } catch (error) {
    if (error instanceof BrowserUnavailableError) {
      db.insert(events)
        .values({
          leadId: existing?.id ?? null,
          type: "browser_unavailable",
          payload: { jobId: context.id, reason: error.message, instagramUsername },
        })
        .run();
      pauseSystem(`Navegador indisponível: ${error.message}`);
    }
    throw error;
  }

  const decisionMakerType = classifyDecisionMaker(scraped.bio, scraped.profileCategory);
  const icpScore = computeIcpScore(scraped.bio, business.icpKeywords);
  const priority = computePriority(icpScore, decisionMakerType);

  const leadId = existing
    ? existing.id
    : db.insert(leads).values({ instagramUsername, discoveredVia: "browser_scrape" }).returning({ id: leads.id }).get().id;

  db.update(leads)
    .set({
      fullName: scraped.fullName ?? existing?.fullName ?? null,
      bio: scraped.bio ?? existing?.bio ?? null,
      profileCategory: scraped.profileCategory ?? existing?.profileCategory ?? null,
      isPrivate: scraped.isPrivate,
      followerCount: scraped.followerCount ?? existing?.followerCount ?? null,
      decisionMakerType,
      icpScore,
      priority,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(leads.id, leadId))
    .run();

  db.insert(events)
    .values({
      leadId,
      type: "lead_discovered",
      payload: { instagramUsername, icpScore, decisionMakerType, priority },
    })
    .run();

  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (lead && !lead.doNotContact && lead.channelState === "browser_contact_pending") {
    enqueueJob({
      type: "send_browser_dm",
      payload: { leadId },
      idempotencyKey: `send_browser_dm:${leadId}`,
      leadId,
    });
  }
}
