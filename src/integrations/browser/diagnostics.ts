import fs from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright-core";

export interface FailureDiagnostics {
  jobId: number;
  url: string;
  screenshotPath: string | null;
  accessibilitySnapshot: string | null;
  consoleErrors: string[];
  networkFailures: string[];
  error: string;
}

function safePageUrl(page: Page): string {
  try {
    return page.url();
  } catch {
    return "unknown";
  }
}

async function captureScreenshot(page: Page, jobId: number): Promise<string | null> {
  const dir = "screenshots";
  const filePath = path.join(dir, `job-${jobId}-${Date.now()}.png`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await page.screenshot({ path: filePath });
    return filePath;
  } catch {
    return null;
  }
}

/** Captures everything prompt.MD requires on browser job failure: screenshot, a11y snapshot, URL, console and network errors, job id. */
export async function captureFailureDiagnostics(params: {
  page: Page;
  jobId: number;
  consoleErrors: string[];
  networkFailures: string[];
  error: unknown;
}): Promise<FailureDiagnostics> {
  const { page, jobId, consoleErrors, networkFailures, error } = params;

  const [screenshotPath, accessibilitySnapshot] = await Promise.all([
    captureScreenshot(page, jobId),
    page.ariaSnapshot().catch(() => null),
  ]);

  return {
    jobId,
    url: safePageUrl(page),
    screenshotPath,
    accessibilitySnapshot,
    consoleErrors,
    networkFailures,
    error: error instanceof Error ? error.message : String(error),
  };
}
