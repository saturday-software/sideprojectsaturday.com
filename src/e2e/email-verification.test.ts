import { commands } from "vitest/browser";
import { describe, expect, test } from "vitest";

declare module "vitest/browser" {
  interface BrowserCommands {
    submitSubscription(url: string, email: string): Promise<string>;
    waitForSentEmail(timeoutMs?: number): Promise<string>;
    visitPage(url: string): Promise<string>;
  }
}

const BASE_URL = "http://localhost:4322";

describe("e2e: email verification flow", () => {
  test("subscribe → receive email → follow verification link → verified", async () => {
    const email = `e2e-${Date.now()}@example.com`;

    // 1. Visit the homepage, fill in email, and submit the form
    const message = await commands.submitSubscription(BASE_URL, email);
    expect(message).toContain("Check your inbox");

    // 2. Read the verification email (.eml file written by wrangler)
    const emlContent = await commands.waitForSentEmail();
    expect(emlContent).toContain("verify?token=");

    // 3. Extract the verification link from the email
    const linkMatch = emlContent.match(
      /https?:\/\/[^\s"<>]*\/verify\?token=[^\s"<>]*/,
    );
    expect(linkMatch).toBeTruthy();

    // Replace the production URL with localhost for local testing
    const verifyUrl = linkMatch![0].replace(
      "https://sideprojectsaturday.com",
      BASE_URL,
    );

    // 4. Click the verification link
    const heading = await commands.visitPage(verifyUrl);
    expect(heading).toBe("You're in.");
  });
});
