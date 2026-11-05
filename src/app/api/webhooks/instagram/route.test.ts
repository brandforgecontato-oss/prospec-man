import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueJob = vi.fn();
vi.mock("@/worker/queue", () => ({ enqueueJob: (...args: unknown[]) => enqueueJob(...args) }));

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf-8").digest("hex")}`;
}

describe("instagram webhook route", () => {
  let sqlite: typeof import("@/db/client").sqlite;
  let route: typeof import("./route");
  const secret = "app-secret";

  beforeAll(async () => {
    process.env.DATABASE_URL = ":memory:";
    process.env.INSTAGRAM_APP_SECRET = secret;
    process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "verify-token";
    process.env.INSTAGRAM_ACCESS_TOKEN = "token";
    process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID = "biz-1";

    const client = await import("@/db/client");
    sqlite = client.sqlite;
    route = await import("./route");
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    enqueueJob.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET echoes hub.challenge for a valid verify token", async () => {
    const url = new URL("http://localhost/api/webhooks/instagram");
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", "verify-token");
    url.searchParams.set("hub.challenge", "12345");

    const response = await route.GET(new NextRequest(url));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
  });

  it("GET returns 403 for an invalid verify token", async () => {
    const url = new URL("http://localhost/api/webhooks/instagram");
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", "wrong");
    url.searchParams.set("hub.challenge", "12345");

    const response = await route.GET(new NextRequest(url));

    expect(response.status).toBe(403);
  });

  it("POST rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    const request = new NextRequest("http://localhost/api/webhooks/instagram", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=invalid" },
      body,
    });

    const response = await route.POST(request);
    expect(response.status).toBe(401);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("POST enqueues one job per inbound text message and returns 200", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "igsid-1" },
              recipient: { id: "biz-1" },
              timestamp: 1700000000000,
              message: { mid: "mid-1", text: "Oi!" },
            },
          ],
        },
      ],
    });
    const request = new NextRequest("http://localhost/api/webhooks/instagram", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body, secret) },
      body,
    });

    const response = await route.POST(request);

    expect(response.status).toBe(200);
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: "poll_webhook_inbox", idempotencyKey: "poll_webhook_inbox:mid-1" }),
    );
  });
});
