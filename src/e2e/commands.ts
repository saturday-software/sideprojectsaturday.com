import type { BrowserCommand } from "vitest/node";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEV_LOG_PATH as DEV_LOG_RELATIVE } from "./constants.js";

const DEV_LOG_PATH = join(process.cwd(), DEV_LOG_RELATIVE);

/** Byte offset past the last matched email — prevents stale matches on repeat calls. */
let lastEmailOffset = 0;

/**
 * Open a new browser page, navigate to the homepage,
 * fill in the email input, and submit the subscription form.
 * Returns the success/error message text shown on the page.
 */
export const submitSubscription: BrowserCommand<
  [url: string, email: string]
> = async (ctx, url, email) => {
  // Record current log size so waitForSentEmail only scans new output
  try {
    lastEmailOffset = statSync(DEV_LOG_PATH).size;
  } catch {
    lastEmailOffset = 0;
  }

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
 * Poll the dev server log for a send_email line referencing the HTML body
 * file that miniflare writes for the builder-form send(), then read and
 * return its contents (already decoded — no MIME wrapping for this form).
 */
export const waitForSentEmail: BrowserCommand<
  [timeoutMs?: number]
> = async (_ctx, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const log = readFileSync(DEV_LOG_PATH, "utf-8").slice(lastEmailOffset);
      const match = log.match(/^HTML:\s*(\S+\.html)/m);
      if (match) {
        return readFileSync(match[1], "utf-8");
      }
    } catch {
      // Log file might not exist yet or body not written yet
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    const log = readFileSync(DEV_LOG_PATH, "utf-8");
    throw new Error(
      `No email body file found in dev server output within ${timeoutMs}ms.\nDev log tail:\n${log.slice(-2000)}`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("No email")) throw err;
    throw new Error(`No email body file found and could not read dev log`);
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
