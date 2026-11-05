import { createHmac, timingSafeEqual } from "node:crypto";

import { WebhookSignatureError } from "./errors";

/** Meta's GET handshake: echoes `hub.challenge` back only if `hub.verify_token` matches. */
export function verifyWebhookChallenge(params: URLSearchParams, verifyToken: string): string {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || token !== verifyToken || !challenge) {
    throw new WebhookSignatureError("Falha na verificação do webhook (hub.verify_token não confere)");
  }
  return challenge;
}

/** Verifies `X-Hub-Signature-256: sha256=<hex>` against the raw request body. Must run on the raw body, before JSON.parse. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf-8").digest("hex");
  const receivedHex = signatureHeader.slice("sha256=".length);

  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export interface InboundMessageEvent {
  mid: string;
  senderId: string;
  recipientId: string;
  text: string;
  timestamp: number;
}

interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
}

interface MetaWebhookPayload {
  object?: string;
  entry?: { messaging?: MetaMessagingEvent[] }[];
}

/**
 * Normalizes Meta's Instagram messaging webhook payload into inbound text
 * events. Echoes (messages the page itself sent, delivered back on the same
 * webhook) and non-text messages (attachments, reactions) are skipped —
 * out of scope for this step.
 */
export function parseWebhookPayload(raw: unknown): InboundMessageEvent[] {
  const payload = raw as MetaWebhookPayload;
  const events: InboundMessageEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const senderId = messaging.sender?.id;
      const recipientId = messaging.recipient?.id;
      const mid = messaging.message?.mid;
      const text = messaging.message?.text;
      if (messaging.message?.is_echo || !senderId || !recipientId || !mid || !text) {
        continue;
      }
      events.push({ mid, senderId, recipientId, text, timestamp: messaging.timestamp ?? Date.now() });
    }
  }

  return events;
}
