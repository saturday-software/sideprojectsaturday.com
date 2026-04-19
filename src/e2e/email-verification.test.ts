import { commands } from "vitest/browser";
import { describe, expect, test } from "vitest";
import { DEV_PORT } from "./constants.js";

declare module "vitest/browser" {
  interface BrowserCommands {
    submitSubscription(url: string, email: string): Promise<string>;
    waitForSentEmail(timeoutMs?: number): Promise<string>;
    visitPage(url: string): Promise<string>;
  }
}

const BASE_URL = `http://localhost:${DEV_PORT}`;

describe("e2e: email verification flow", () => {
  test("subscribe → receive email → follow verification link → verified", async () => {
    const email = `e2e-${Date.now()}@example.com`;

    // 1. Visit the homepage, fill in email, and submit the form
    const message = await commands.submitSubscription(BASE_URL, email);
    expect(message).toContain("Check your inbox");

    // 2. Read the verification email (.html body file written by miniflare)
    const emailBody = await commands.waitForSentEmail();
    expect(emailBody).toContain("verify?token=");

    // 3. Extract the verification link from the email
    const linkMatch = emailBody.match(
      /https?:\/\/[^\s"<>]*\/verify\?token=[^\s"<>]*/,
    );
    expect(linkMatch).not.toBeNull();

    // Replace the production origin with localhost for local testing
    const parsed = new URL(linkMatch![0]);
    const base = new URL(BASE_URL);
    parsed.host = base.host;
    parsed.protocol = base.protocol;
    const verifyUrl = parsed.toString();

    // 4. Click the verification link
    const heading = await commands.visitPage(verifyUrl);
    expect(heading).toBe("You're in.");
  });
});
