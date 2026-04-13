import type { BrowserCommand } from "vitest/node";
import { execSync } from "node:child_process";

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
 * Poll the local D1 database for a pending subscriber's verification token.
 * Returns the token once found, or throws after timeout.
 */
export const getVerificationToken: BrowserCommand<
  [email: string, timeoutMs?: number]
> = async (_ctx, email, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const output = execSync(
        `npx wrangler d1 execute sps --local --command="SELECT verification_token FROM subscribers WHERE email = '${email}' AND status = 'pending'"`,
        { encoding: "utf-8", cwd: process.cwd(), stdio: "pipe" },
      );

      // Extract JSON array from wrangler output
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        const token = results[0]?.results?.[0]?.verification_token;
        if (token) return token as string;
      }
    } catch {
      // Subscriber might not exist yet
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `No verification token found for ${email} within ${timeoutMs}ms`,
  );
};

/**
 * Open a new browser page, navigate to the given URL,
 * and return the text content of the <h1> element.
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
