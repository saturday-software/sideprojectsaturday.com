import { commands } from "vitest/browser";
import { describe, expect, test } from "vitest";

declare module "vitest/browser" {
  interface BrowserCommands {
    seedVerifiedSubscriber(
      email: string,
      isParticipant?: boolean,
    ): Promise<void>;
    triggerCron(cron: string): Promise<number>;
    waitForSentEmail(timeoutMs?: number): Promise<string>;
  }
}

describe("e2e: cron triggers", () => {
  test("Wednesday cron sends announcement email to subscribers", async () => {
    const email = `cron-wed-${Date.now()}@example.com`;
    await commands.seedVerifiedSubscriber(email);

    const status = await commands.triggerCron("0 13 * * 3");
    expect(status).toBe(200);

    const emailBody = await commands.waitForSentEmail(15_000);
    expect(emailBody).toContain("Side Project Saturday");
  });

  test("Friday cron sends reminder email to subscribers", async () => {
    const email = `cron-fri-${Date.now()}@example.com`;
    await commands.seedVerifiedSubscriber(email);

    const status = await commands.triggerCron("0 13 * * 5");
    expect(status).toBe(200);

    const emailBody = await commands.waitForSentEmail(15_000);
    expect(emailBody).toContain("tomorrow");
  });

  test("Sunday cron sends recap email to participants", async () => {
    const email = `cron-sun-${Date.now()}@example.com`;
    await commands.seedVerifiedSubscriber(email, true);

    const status = await commands.triggerCron("0 16 * * SUN");
    expect(status).toBe(200);

    const emailBody = await commands.waitForSentEmail(15_000);
    expect(emailBody).toContain("Recap");
  });
});
