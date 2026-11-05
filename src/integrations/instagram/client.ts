import type { InstagramConfig } from "./config";
import { InstagramApiError } from "./errors";

function graphUrl(config: InstagramConfig, path: string, params: Record<string, string>): URL {
  const url = new URL(`${config.graphApiBaseUrl}/${config.graphApiVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", config.accessToken);
  return url;
}

export interface SendApiMessageResult {
  providerMessageId: string;
}

/** Sends a text DM via the Instagram Messaging API (POST /{ig-business-id}/messages). */
export async function sendApiMessage(
  config: InstagramConfig,
  recipientId: string,
  text: string,
): Promise<SendApiMessageResult> {
  const url = graphUrl(config, config.businessAccountId + "/messages", {});
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });

  const body = (await response.json().catch(() => null)) as { message_id?: string } | null;
  if (!response.ok || !body?.message_id) {
    throw new InstagramApiError(
      `Falha ao enviar mensagem via API do Instagram (status ${response.status})`,
      response.status,
      body,
    );
  }
  return { providerMessageId: body.message_id };
}

/**
 * Resolves the Instagram username behind an IGSID (the sender id on an
 * inbound webhook event) so a first-reply can be matched back to the lead
 * the browser DM went to. Returns null on any failure — the caller decides
 * whether that means "unmatched, needs review".
 */
export async function fetchProfileUsername(
  config: InstagramConfig,
  igsid: string,
): Promise<string | null> {
  try {
    const url = graphUrl(config, igsid, { fields: "username" });
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = (await response.json()) as { username?: string };
    return body.username ?? null;
  } catch {
    return null;
  }
}
