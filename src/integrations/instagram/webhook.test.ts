import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { WebhookSignatureError } from "./errors";
import { parseWebhookPayload, verifyWebhookChallenge, verifyWebhookSignature } from "./webhook";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf-8").digest("hex")}`;
}

describe("verifyWebhookChallenge", () => {
  it("returns hub.challenge when mode and token match", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "secret-token",
      "hub.challenge": "12345",
    });
    expect(verifyWebhookChallenge(params, "secret-token")).toBe("12345");
  });

  it("throws when the verify token does not match", () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong",
      "hub.challenge": "12345",
    });
    expect(() => verifyWebhookChallenge(params, "secret-token")).toThrow(WebhookSignatureError);
  });

  it("throws when mode is not subscribe", () => {
    const params = new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "secret-token",
      "hub.challenge": "12345",
    });
    expect(() => verifyWebhookChallenge(params, "secret-token")).toThrow(WebhookSignatureError);
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ object: "instagram", entry: [] });

  it("accepts a correctly signed body", () => {
    expect(verifyWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const tampered = body.replace("instagram", "tampered!!");
    expect(verifyWebhookSignature(tampered, sign(body, secret), secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", () => {
    expect(verifyWebhookSignature(body, "abcdef", secret)).toBe(false);
  });
});

describe("parseWebhookPayload", () => {
  it("extracts text messages from the messaging array", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "igsid-1" },
              recipient: { id: "biz-1" },
              timestamp: 1700000000000,
              message: { mid: "mid-1", text: "Oi, quero saber mais" },
            },
          ],
        },
      ],
    };
    expect(parseWebhookPayload(payload)).toEqual([
      { mid: "mid-1", senderId: "igsid-1", recipientId: "biz-1", text: "Oi, quero saber mais", timestamp: 1700000000000 },
    ]);
  });

  it("skips echoes of the page's own outbound messages", () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: "biz-1" },
              recipient: { id: "igsid-1" },
              message: { mid: "mid-1", text: "oi", is_echo: true },
            },
          ],
        },
      ],
    };
    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it("skips messages without text (attachments, reactions)", () => {
    const payload = {
      entry: [{ messaging: [{ sender: { id: "a" }, recipient: { id: "b" }, message: { mid: "mid-1" } }] }],
    };
    expect(parseWebhookPayload(payload)).toEqual([]);
  });

  it("returns an empty array for a payload with no entries", () => {
    expect(parseWebhookPayload({})).toEqual([]);
  });
});
