import { describe, expect, it, vi } from "vitest";

import type { AgentPage } from "./session";
import { sendDirectMessage } from "./dm";

function fakeAgentPage(
  options: { url?: string; composerHasName?: boolean; remainingTextAfterEnter?: string } = {},
) {
  let url = options.url ?? "https://www.instagram.com/lead/";
  const composerHasName = options.composerHasName ?? true;
  const remainingTextAfterEnter = options.remainingTextAfterEnter ?? "";

  const namedComposer = {
    click: vi.fn(async () => undefined),
    pressSequentially: vi.fn(async () => undefined),
    press: vi.fn(async () => undefined),
    innerText: vi.fn(async () => remainingTextAfterEnter),
    page: () => ({ waitForTimeout: vi.fn(async () => undefined) }),
    count: vi.fn(async () => (composerHasName ? 1 : 0)),
  };
  const unnamedComposer = {
    click: vi.fn(async () => undefined),
    pressSequentially: vi.fn(async () => undefined),
    press: vi.fn(async () => undefined),
    innerText: vi.fn(async () => remainingTextAfterEnter),
    page: () => ({ waitForTimeout: vi.fn(async () => undefined) }),
    last: vi.fn(() => unnamedComposer),
  };
  const messageButton = { click: vi.fn(async () => undefined) };

  const page = {
    url: () => url,
    goto: vi.fn(async (target: string) => {
      url = target;
    }),
    getByRole: vi.fn((role: string, opts?: { name?: RegExp }) => {
      if (role === "button") return messageButton;
      return opts?.name ? namedComposer : unnamedComposer;
    }),
  };

  const agentPage: AgentPage = { page: page as never, consoleErrors: [], networkFailures: [] };
  return { agentPage, page, messageButton, namedComposer, unnamedComposer };
}

describe("sendDirectMessage", () => {
  it("opens the composer, types the message, presses Enter and confirms the composer cleared", async () => {
    const { agentPage, messageButton, namedComposer } = fakeAgentPage({ remainingTextAfterEnter: "" });

    const result = await sendDirectMessage(agentPage, "loja_teste", "Oi!");

    expect(messageButton.click).toHaveBeenCalledTimes(1);
    expect(namedComposer.pressSequentially).toHaveBeenCalledWith("Oi!", expect.anything());
    expect(namedComposer.press).toHaveBeenCalledWith("Enter");
    expect(result).toEqual({ sent: true });
  });

  it("throws instead of reporting success when the composer still has text after Enter", async () => {
    // Real-world case: Instagram silently swallowed a simulated Enter
    // keypress — no error was thrown, but the message never sent, and the
    // typed text was still sitting in the composer.
    const { agentPage } = fakeAgentPage({ remainingTextAfterEnter: "Oi!" });

    await expect(sendDirectMessage(agentPage, "loja_teste", "Oi!")).rejects.toThrow(
      "Envio não confirmado",
    );
  });

  it("dry-run: types the message but never presses Enter", async () => {
    const { agentPage, messageButton, namedComposer } = fakeAgentPage();

    const result = await sendDirectMessage(agentPage, "loja_teste", "Oi!", { dryRun: true });

    expect(messageButton.click).toHaveBeenCalledTimes(1);
    expect(namedComposer.pressSequentially).toHaveBeenCalledWith("Oi!", expect.anything());
    expect(namedComposer.press).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false });
  });

  it("falls back to the unnamed textbox when the composer has no accessible name (confirmed against real Instagram)", async () => {
    const { agentPage, namedComposer, unnamedComposer } = fakeAgentPage({ composerHasName: false });

    const result = await sendDirectMessage(agentPage, "loja_teste", "Oi!", { dryRun: true });

    expect(namedComposer.pressSequentially).not.toHaveBeenCalled();
    expect(unnamedComposer.pressSequentially).toHaveBeenCalledWith("Oi!", expect.anything());
    expect(result).toEqual({ sent: false });
  });
});
