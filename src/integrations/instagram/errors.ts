/** `X-Hub-Signature-256` missing or not matching the payload — request is rejected before parsing. */
export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/** A Graph API call returned a non-2xx response. */
export class InstagramApiError extends Error {
  readonly status: number;
  readonly responseBody: unknown;

  constructor(message: string, status: number, responseBody: unknown) {
    super(message);
    this.name = "InstagramApiError";
    this.status = status;
    this.responseBody = responseBody;
  }
}
