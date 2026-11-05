import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import type { BrowserConfig } from "./config";
import { BrowserUnavailableError, DomainViolationError } from "./errors";

const ALLOWED_HOST = "instagram.com";

let sharedBrowser: Browser | null = null;
/** Serializes browser jobs: prompt.MD requires exactly one navigator job in flight at a time. */
let mutex: Promise<unknown> = Promise.resolve();

function assertInstagramUrl(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new DomainViolationError(`URL inválida para a aba do agente: ${url}`);
  }
  if (host !== ALLOWED_HOST && !host.endsWith(`.${ALLOWED_HOST}`)) {
    throw new DomainViolationError(`Navegação fora do domínio do Instagram: ${url}`);
  }
}

async function connect(cdpUrl: string): Promise<Browser> {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
  try {
    sharedBrowser = await chromium.connectOverCDP(cdpUrl);
  } catch (cause) {
    throw new BrowserUnavailableError(
      `Falha ao conectar ao Chrome via CDP em ${cdpUrl}. Confirme que o Chrome foi aberto com o perfil dedicado e a porta de debug.`,
      { cause },
    );
  }
  return sharedBrowser;
}

async function getLoggedInContext(browser: Browser): Promise<BrowserContext> {
  const [context] = browser.contexts();
  if (!context) {
    throw new BrowserUnavailableError(
      "Nenhum contexto logado encontrado no Chrome conectado. Faça login no Instagram no perfil dedicado antes de rodar o worker.",
    );
  }
  return context;
}

export interface AgentPage {
  page: Page;
  consoleErrors: string[];
  networkFailures: string[];
}

/** Navigates the agent's own tab, enforcing the instagram.com domain restriction before and after redirects. */
export async function gotoInstagram(agentPage: AgentPage, url: string): Promise<void> {
  assertInstagramUrl(url);
  await agentPage.page.goto(url);
  assertInstagramUrl(agentPage.page.url());
}

/**
 * Runs fn against a dedicated tab on the operator's already-logged-in Chrome context.
 * One browser job runs at a time; the tab is always closed, even on error.
 * Never opens a new Chrome instance — if connectOverCDP fails, the caller must
 * record `browser_unavailable` and let the job retry rather than working around it.
 */
export async function withAgentPage<T>(
  config: BrowserConfig,
  fn: (agentPage: AgentPage) => Promise<T>,
): Promise<T> {
  const run = async (): Promise<T> => {
    const browser = await connect(config.cdpUrl);
    const context = await getLoggedInContext(browser);
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    const networkFailures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "falha desconhecida";
      networkFailures.push(`${request.method()} ${request.url()}: ${reason}`);
    });

    try {
      return await fn({ page, consoleErrors, networkFailures });
    } finally {
      await page.close().catch(() => undefined);
    }
  };

  const scheduled = mutex.then(run, run);
  mutex = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}

/** For tests only: drops the cached browser handle so the next call reconnects. */
export function resetBrowserSessionForTests(): void {
  sharedBrowser = null;
  mutex = Promise.resolve();
}
