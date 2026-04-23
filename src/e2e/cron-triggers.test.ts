import { commands } from "vitest/browser";
import { describe, expect, test } from "vitest";

declare module "vitest/browser" {
  interface BrowserCommands {
    seedVerifiedSubscriber(
      email: string,
      isParticipant?: boolean,
    ): Promise<void>;
    triggerCron(cron: string, timeMs?: number): Promise<number>;
    waitForSentEmail(timeoutMs?: number): Promise<string>;
  }
}

/** Build a unix-ms timestamp for the next UTC weekday + hour at/after `from`. */
function nextUtcMoment(weekday: number, hour: number, from: Date = new Date()): number {
  const d = new Date(from);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(hour);
  const delta = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d.getTime();
}

describe("e2e: cron triggers", () => {
  test("Wednesday cron sends announcement email to subscribers", async () => {
    const email = `cron-wed-${Date.now()}@example.com`;
    await commands.seedVerifiedSubscriber(email);

    const status = await commands.triggerCron("0 13 * * WED", nextUtcMoment(3, 13));
    expect(status).toBe(200);

    const emailBody = await commands.waitForSentEmail(15_000);
    expect(emailBody).toContain("Side Project Saturday");
  });

  test("Friday cron sends reminder email to subscribers", async () => {
    const email = `cron-fri-${Date.now()}@example.com`;
    await commands.seedVerifiedSubscriber(email);

    const status = await commands.triggerCron("0 13 * * FRI", nextUtcMoment(5, 13));
    expect(status).toBe(200);

    const emailBody = await commands.waitForSentEmail(15_000);
    expect(emailBody).toContain("tomorrow");
  });

  test("Sunday cron sends recap email to participants", async () => {
    const email = `cron-sun-${Date.now()}@example.com`;
    await commands.seedVerifiedSubscriber(email, true);

    const status = await commands.triggerCron("0 16 * * SUN", nextUtcMoment(0, 16));
    expect(status).toBe(200);

    const emailBody = await commands.waitForSentEmail(15_000);
    expect(emailBody).toContain("Recap");
  });
});
