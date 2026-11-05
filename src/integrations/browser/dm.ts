import type { Locator, Page } from "playwright-core";

import type { AgentPage } from "./session";
import { gotoInstagram } from "./session";
import { typeLikeHuman } from "./typing";

/**
 * Real Instagram (confirmed via dry-run, prompt.MD "Testes" nível 2) exposes
 * the DM composer as a `textbox` with no accessible name at all — the
 * placeholder text isn't exposed as its name. It's the only textbox in the
 * conversation panel once the composer is open, so falling back to it (no
 * name filter) is reliable without being as brittle as a CSS class.
 */
async function findComposer(page: Page): Promise<Locator> {
  const named = page.getByRole("textbox", { name: /message|mensagem/i });
  if ((await named.count()) > 0) return named;
  return page.getByRole("textbox").last();
}

export interface SendDirectMessageOptions {
  /**
   * prompt.MD "Testes" nível 2: exercises navigation, the composer button
   * and typing against the real page, but stops right before the one
   * action that actually sends the message — so a dry-run script can
   * confirm the selectors work without ever risking a real DM.
   */
  dryRun?: boolean;
}

export interface SendDirectMessageResult {
  sent: boolean;
}

/**
 * Opens the profile's message composer and sends `text` as the first DM.
 * Role/text-based locators, not CSS classes, per prompt.MD — the exact
 * button and field labels must still be confirmed against a real profile
 * during the dry-run (prompt.MD "Testes", nível 2) before going live.
 */
export async function sendDirectMessage(
  agentPage: AgentPage,
  username: string,
  text: string,
  options: SendDirectMessageOptions = {},
): Promise<SendDirectMessageResult> {
  await gotoInstagram(agentPage, `https://www.instagram.com/${username}/`);

  const messageButton = agentPage.page.getByRole("button", {
    name: /^(message|enviar mensagem)$/i,
  });
  await messageButton.click();

  const composer = await findComposer(agentPage.page);
  await typeLikeHuman(composer, text);

  if (options.dryRun) {
    return { sent: false };
  }

  await composer.press("Enter");

  // A simulated Enter keypress doesn't always reach Instagram's rich-text
  // composer the way a real one does (confirmed by a real send that
  // reported success here yet never reached the recipient's inbox) — a
  // delivered message always clears the composer, so check for that
  // instead of trusting that `.press()` not throwing means it worked.
  await composer.page().waitForTimeout(500);
  const remainingText = await composer.innerText().catch(() => "");
  if (remainingText.trim().length > 0) {
    throw new Error(
      "Envio não confirmado: a caixa de mensagem ainda contém o texto digitado depois do Enter.",
    );
  }

  return { sent: true };
}
