import type { Locator } from "playwright-core";

import { randomPauseBeforeSendMs, randomTypingDelayMs } from "./pacing";

/** Types into a field with per-character delay, then pauses before the caller presses send. */
export async function typeLikeHuman(locator: Locator, text: string): Promise<void> {
  await locator.click();
  await locator.pressSequentially(text, { delay: randomTypingDelayMs() });
  await locator.page().waitForTimeout(randomPauseBeforeSendMs());
}
