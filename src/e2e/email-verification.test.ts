import { describe, expect, test, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  addSubscriber,
  verifySubscriber,
  getVerifiedSubscribers,
} from "@/lib/subscribers";
import { sendEmail } from "@/email/send";
import { verificationEmail } from "@/email/templates";

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', is_participant INTEGER NOT NULL DEFAULT 0, verification_token TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), verified_at TEXT)";

const SITE_URL = "https://sideprojectsaturday.com";
const FROM_EMAIL = "hello@sideprojectsaturday.com";

describe("e2e: subscribe → email → verify", () => {
  beforeEach(async () => {
    await env.DB.exec("DROP TABLE IF EXISTS subscribers");
    await env.DB.exec(SCHEMA);
  });

  test("full flow: subscribe on homepage, receive verification email, follow link, verify", async () => {
    const subscriberEmail = "newuser@example.com";

    // --- Step 1: Subscribe on the homepage ---
    // Simulates the form POST that triggers the subscribe action
    const subscribeResult = await addSubscriber(env.DB, subscriberEmail);
    expect(subscribeResult.status).toBe("sent");
    const { token } = subscribeResult as { status: "sent"; token: string };

    // Subscriber should be pending in the database
    const pending = await env.DB.prepare(
      "SELECT status, verification_token FROM subscribers WHERE email = ?"
    )
      .bind(subscriberEmail)
      .first<{ status: string; verification_token: string }>();
    expect(pending!.status).toBe("pending");
    expect(pending!.verification_token).toBe(token);

    // --- Step 2: Send the verification email ---
    // The subscribe action builds the email template and sends it
    const template = verificationEmail(SITE_URL, token);
    expect(template.subject).toBe(
      "Confirm your subscription to Side Project Saturday"
    );

    await sendEmail(env.EMAIL, {
      to: subscriberEmail,
      subject: template.subject,
      html: template.html,
      from: FROM_EMAIL,
    });

    // --- Step 3: Receive the email and extract the verification link ---
    // Parse the email HTML to find the verify link (simulates user reading the email)
    const linkMatch = template.html.match(
      /href="(https:\/\/[^"]*\/verify\?token=[^"]*)"/
    );
    expect(linkMatch).not.toBeNull();

    const verifyUrl = new URL(linkMatch![1]);
    expect(verifyUrl.pathname).toBe("/verify");
    const emailToken = verifyUrl.searchParams.get("token");
    expect(emailToken).toBeTruthy();

    // --- Step 4: Follow the verification link ---
    // Simulates clicking the link in the email, which hits /verify?token=...
    const success = await verifySubscriber(env.DB, emailToken!);
    expect(success).toBe(true);

    // --- Step 5: Confirm the subscriber is now verified ---
    const row = await env.DB.prepare(
      "SELECT status, verification_token, verified_at FROM subscribers WHERE email = ?"
    )
      .bind(subscriberEmail)
      .first<{
        status: string;
        verification_token: string | null;
        verified_at: string | null;
      }>();
    expect(row!.status).toBe("verified");
    expect(row!.verification_token).toBeNull();
    expect(row!.verified_at).toBeTruthy();

    // Verified subscriber appears in the mailing list
    const verified = await getVerifiedSubscribers(env.DB);
    expect(verified).toEqual([{ email: subscriberEmail }]);
  });

  test("verification link can only be used once", async () => {
    const subscriberEmail = "oneshot@example.com";

    const { token } = (await addSubscriber(env.DB, subscriberEmail)) as {
      status: "sent";
      token: string;
    };

    // Build and send the verification email
    const template = verificationEmail(SITE_URL, token);
    await sendEmail(env.EMAIL, {
      to: subscriberEmail,
      subject: template.subject,
      html: template.html,
      from: FROM_EMAIL,
    });

    // Extract token from email and verify
    const linkMatch = template.html.match(
      /href="(https:\/\/[^"]*\/verify\?token=[^"]*)"/
    );
    const emailToken = new URL(linkMatch![1]).searchParams.get("token")!;

    expect(await verifySubscriber(env.DB, emailToken)).toBe(true);

    // Clicking the same link again should fail
    expect(await verifySubscriber(env.DB, emailToken)).toBe(false);
  });

  test("invalid verification link returns failure", async () => {
    const success = await verifySubscriber(env.DB, "bogus-token-from-email");
    expect(success).toBe(false);
  });
});
