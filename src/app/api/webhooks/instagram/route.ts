import { NextResponse, type NextRequest } from "next/server";

import { loadInstagramConfig } from "@/integrations/instagram/config";
import { WebhookSignatureError } from "@/integrations/instagram/errors";
import {
  parseWebhookPayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from "@/integrations/instagram/webhook";
import { enqueueJob } from "@/worker/queue";

export const dynamic = "force-dynamic";

/** Meta's one-time subscription handshake. */
export async function GET(request: NextRequest): Promise<Response> {
  const config = loadInstagramConfig();
  try {
    const challenge = verifyWebhookChallenge(request.nextUrl.searchParams, config.webhookVerifyToken);
    return new Response(challenge, { status: 200 });
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      return new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}

/**
 * Receives inbound Instagram messages. Only verifies the signature, parses
 * and enqueues one durable job per message — the actual lead-matching and
 * pipeline/channel transition happens in the worker (`pollWebhookInbox`), so
 * this handler stays fast and Meta always gets its 200 within the delivery
 * timeout regardless of worker load.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const config = loadInstagramConfig();
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature, config.appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let events;
  try {
    events = parseWebhookPayload(JSON.parse(rawBody));
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  for (const event of events) {
    enqueueJob({
      type: "poll_webhook_inbox",
      payload: event,
      idempotencyKey: `poll_webhook_inbox:${event.mid}`,
    });
  }

  return NextResponse.json({ status: "EVENT_RECEIVED" });
}
