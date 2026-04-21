import type { BrowserCommand } from "vitest/node";
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEV_LOG_PATH as DEV_LOG_RELATIVE, DEV_PORT } from "./constants.js";

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
      const fullLog = readFileSync(DEV_LOG_PATH, "utf-8");
      const log = fullLog.slice(lastEmailOffset);
      const match = log.match(/^HTML:\s*(\S+\.html)/m);
      if (match) {
        // Advance offset past this match so subsequent calls don't re-read it
        lastEmailOffset += match.index! + match[0].length;
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
 * Insert a verified subscriber directly into the local D1 database.
 * Optionally mark them as a participant (needed for Sunday recap).
 */
export const seedVerifiedSubscriber: BrowserCommand<
  [email: string, isParticipant?: boolean]
> = async (_ctx, email, isParticipant = false) => {
  const sql = `INSERT OR IGNORE INTO subscribers (email, status, is_participant, verified_at) VALUES ('${email}', 'verified', ${isParticipant ? 1 : 0}, datetime('now'))`;
  execSync(`bunx wrangler d1 execute sps --local --command "${sql}"`, {
    cwd: process.cwd(),
    stdio: "pipe",
  });
};

/**
 * Trigger a cron schedule via the local dev server's scheduled handler.
 * Resets the email log offset so waitForSentEmail only picks up new emails.
 * Returns the HTTP status code.
 */
export const triggerCron: BrowserCommand<[cron: string]> = async (
  _ctx,
  cron,
) => {
  // Reset email offset so waitForSentEmail picks up only new emails
  try {
    lastEmailOffset = statSync(DEV_LOG_PATH).size;
  } catch {
    lastEmailOffset = 0;
  }

  const encoded = cron.replace(/ /g, "+");
  const url = `http://localhost:${DEV_PORT}/cdn-cgi/handler/scheduled?cron=${encoded}`;
  const res = await fetch(url);
  return res.status;
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
