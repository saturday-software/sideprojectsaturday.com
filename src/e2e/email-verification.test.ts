import { commands } from "vitest/browser";
import { describe, expect, test } from "vitest";

declare module "vitest/browser" {
  interface BrowserCommands {
    submitSubscription(url: string, email: string): Promise<string>;
    getVerificationToken(
      email: string,
      timeoutMs?: number,
    ): Promise<string>;
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

    // 2. Retrieve the verification token (proves the email was sent)
    const token = await commands.getVerificationToken(email);
    expect(token).toBeTruthy();

    // 3. Follow the verification link
    const verifyUrl = `${BASE_URL}/verify?token=${token}`;
    const heading = await commands.visitPage(verifyUrl);
    expect(heading).toBe("You're in.");
  });
});
