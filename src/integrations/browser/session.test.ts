import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectOverCDP = vi.fn();

vi.mock("playwright-core", () => ({
  chromium: { connectOverCDP: (...args: unknown[]) => connectOverCDP(...args) },
}));

import type { BrowserConfig } from "./config";
import { BrowserUnavailableError, DomainViolationError } from "./errors";
import { gotoInstagram, resetBrowserSessionForTests, withAgentPage } from "./session";

const config: BrowserConfig = {
  cdpUrl: "http://127.0.0.1:9222",
  profileDir: "/tmp/chrome-profile",
  maxDmsPerDay: 30,
  minSecondsBetweenDms: 90,
  maxSecondsBetweenDms: 240,
  operatingHours: { startHour: 9, endHour: 20 },
  operatingTimezone: "America/Sao_Paulo",
};

function fakePage(url = "https://www.instagram.com/inbox") {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    url: () => url,
    goto: vi.fn(async (target: string) => {
      url = target;
    }),
    close: vi.fn(async () => undefined),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (listeners[event] ??= []).push(handler);
    }),
  };
}

function fakeContext(page = fakePage()) {
  return { newPage: vi.fn(async () => page) };
}

function fakeBrowser(context: ReturnType<typeof fakeContext> | undefined) {
  return {
    isConnected: () => true,
    contexts: () => (context ? [context] : []),
  };
}

beforeEach(() => {
  connectOverCDP.mockReset();
  resetBrowserSessionForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withAgentPage", () => {
  it("throws BrowserUnavailableError when connectOverCDP fails, without retrying itself", async () => {
    connectOverCDP.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(withAgentPage(config, async () => undefined)).rejects.toBeInstanceOf(
      BrowserUnavailableError,
    );
    expect(connectOverCDP).toHaveBeenCalledTimes(1);
    expect(connectOverCDP).toHaveBeenCalledWith(config.cdpUrl);
  });

  it("throws BrowserUnavailableError when the Chrome context has no logged-in session", async () => {
    connectOverCDP.mockResolvedValueOnce(fakeBrowser(undefined));

    await expect(withAgentPage(config, async () => undefined)).rejects.toBeInstanceOf(
      BrowserUnavailableError,
    );
  });

  it("opens the agent's own tab and always closes it, even on error", async () => {
    const page = fakePage();
    const context = fakeContext(page);
    connectOverCDP.mockResolvedValueOnce(fakeBrowser(context));

    await expect(
      withAgentPage(config, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent browser jobs (one at a time)", async () => {
    const context = fakeContext();
    context.newPage = vi.fn(async () => fakePage());
    connectOverCDP.mockResolvedValue(fakeBrowser(context));

    let concurrent = 0;
    let maxConcurrent = 0;
    const run = () =>
      withAgentPage(config, async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent--;
      });

    await Promise.all([run(), run(), run()]);
    expect(maxConcurrent).toBe(1);
  });
});

describe("gotoInstagram", () => {
  it("navigates when the URL is on instagram.com", async () => {
    const page = fakePage("https://www.instagram.com/");
    await gotoInstagram({ page: page as never, consoleErrors: [], networkFailures: [] }, "https://www.instagram.com/direct/inbox/");
    expect(page.goto).toHaveBeenCalledWith("https://www.instagram.com/direct/inbox/");
  });

  it("rejects a URL outside instagram.com without navigating", async () => {
    const page = fakePage();
    await expect(
      gotoInstagram(
        { page: page as never, consoleErrors: [], networkFailures: [] },
        "https://evil.example.com/",
      ),
    ).rejects.toBeInstanceOf(DomainViolationError);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it("rejects when a redirect lands outside instagram.com", async () => {
    const page = fakePage();
    page.goto = vi.fn(async () => {
      (page as unknown as { url: () => string }).url = () => "https://evil.example.com/redirected";
    });
    await expect(
      gotoInstagram(
        { page: page as never, consoleErrors: [], networkFailures: [] },
        "https://www.instagram.com/",
      ),
    ).rejects.toBeInstanceOf(DomainViolationError);
  });
});
