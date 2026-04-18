import type { BrowserCommand } from "vitest/node";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEV_LOG_PATH = join(process.cwd(), ".wrangler", "e2e-dev.log");

/**
 * Open a new browser page, navigate to the homepage,
 * fill in the email input, and submit the subscription form.
 * Returns the success/error message text shown on the page.
 */
export const submitSubscription: BrowserCommand<
  [url: string, email: string]
> = async (ctx, url, email) => {
  const page = await ctx.context.newPage();
  try {
    await page.goto(url, { timeout: 15_000, waitUntil: "networkidle" });
    await page.fill('input[type="email"]', email);
    await page.click('button[type="submit"]');
    await page.waitForSelector(".message", { timeout: 10_000 });
    const message = await page.textContent(".message");
    return message?.trim() ?? "";
  } finally {
    await page.close();
  }
};

/**
 * Poll the dev server log for a send_email line containing a .eml path,
 * then read and return the raw email content.
 */
export const waitForSentEmail: BrowserCommand<
  [timeoutMs?: number]
> = async (_ctx, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const log = readFileSync(DEV_LOG_PATH, "utf-8");
      // Wrangler logs: [wrangler:inf] send_email binding called with the following message:
      //   /tmp/miniflare-files/email/test-email-abc123.eml
      const emlMatch = log.match(/(\S+\.eml)/);
      if (emlMatch) {
        const emlPath = emlMatch[1];
        const content = readFileSync(emlPath, "utf-8");
        return content;
      }
    } catch {
      // Log file might not exist yet or eml not written yet
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  // If no .eml found, dump the log so we can see what wrangler printed
  try {
    const log = readFileSync(DEV_LOG_PATH, "utf-8");
    throw new Error(
      `No .eml file found in dev server output within ${timeoutMs}ms.\nDev log tail:\n${log.slice(-2000)}`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("No .eml")) throw err;
    throw new Error(`No .eml file found and could not read dev log`);
  }
};

/**
 * Open a new browser page, navigate to the given URL,
 * and return the text content of the content heading.
 */
export const visitPage: BrowserCommand<[url: string]> = async (ctx, url) => {
  const page = await ctx.context.newPage();
  try {
    await page.goto(url, { timeout: 15_000, waitUntil: "networkidle" });
    const heading = await page.textContent(".window-pane h1");
    return heading?.trim() ?? "";
  } finally {
    await page.close();
  }
};
