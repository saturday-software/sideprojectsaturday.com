import { describe, expect, test, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  addSubscriber,
  verifySubscriber,
  unsubscribe,
  getVerifiedSubscribers,
  cleanupExpiredPending,
} from "@/lib/subscribers";

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', is_participant INTEGER NOT NULL DEFAULT 0, verification_token TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), verified_at TEXT)";

beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS subscribers");
  await env.DB.exec(SCHEMA);
});

describe("addSubscriber", () => {
  test("creates a new pending subscriber", async () => {
    const result = await addSubscriber(env.DB, "alice@test.com");
    expect(result.status).toBe("sent");
    expect((result as { token: string }).token).toBeTruthy();

    const row = await env.DB.prepare(
      "SELECT status, verification_token FROM subscribers WHERE email = ?"
    )
      .bind("alice@test.com")
      .first<{ status: string; verification_token: string }>();
    expect(row!.status).toBe("pending");
    expect(row!.verification_token).toBeTruthy();
  });

  test("returns 'verified' for already-verified subscriber", async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, verified_at) VALUES (?, 'verified', datetime('now'))"
    )
      .bind("alice@test.com")
      .run();

    const result = await addSubscriber(env.DB, "alice@test.com");
    expect(result.status).toBe("verified");
  });

  test("rate-limits resend within 10 minutes", async () => {
    const first = await addSubscriber(env.DB, "alice@test.com");
    expect(first.status).toBe("sent");

    const second = await addSubscriber(env.DB, "alice@test.com");
    expect(second.status).toBe("rate_limited");
  });

  test("allows resend after 10 minutes", async () => {
    await addSubscriber(env.DB, "alice@test.com");

    // Backdate created_at to 11 minutes ago
    await env.DB.prepare(
      "UPDATE subscribers SET created_at = datetime('now', '-11 minutes') WHERE email = ?"
    )
      .bind("alice@test.com")
      .run();

    const result = await addSubscriber(env.DB, "alice@test.com");
    expect(result.status).toBe("sent");
  });

  test("resend generates a new token", async () => {
    const first = await addSubscriber(env.DB, "alice@test.com");
    const firstToken = (first as { token: string }).token;

    await env.DB.prepare(
      "UPDATE subscribers SET created_at = datetime('now', '-11 minutes') WHERE email = ?"
    )
      .bind("alice@test.com")
      .run();

    const second = await addSubscriber(env.DB, "alice@test.com");
    const secondToken = (second as { token: string }).token;
    expect(secondToken).not.toBe(firstToken);
  });

  test("allows re-subscribe for unsubscribed users", async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, created_at) VALUES (?, 'unsubscribed', datetime('now', '-1 hour'))"
    )
      .bind("alice@test.com")
      .run();

    const result = await addSubscriber(env.DB, "alice@test.com");
    expect(result.status).toBe("sent");

    const row = await env.DB.prepare(
      "SELECT status FROM subscribers WHERE email = ?"
    )
      .bind("alice@test.com")
      .first<{ status: string }>();
    expect(row!.status).toBe("pending");
  });
});

describe("verifySubscriber", () => {
  test("verifies a pending subscriber by token", async () => {
    const { token } = (await addSubscriber(env.DB, "alice@test.com")) as {
      status: "sent";
      token: string;
    };

    const ok = await verifySubscriber(env.DB, token);
    expect(ok).toBe(true);

    const row = await env.DB.prepare(
      "SELECT status, verification_token, verified_at FROM subscribers WHERE email = ?"
    )
      .bind("alice@test.com")
      .first<{
        status: string;
        verification_token: string | null;
        verified_at: string | null;
      }>();
    expect(row!.status).toBe("verified");
    expect(row!.verification_token).toBeNull();
    expect(row!.verified_at).toBeTruthy();
  });

  test("returns false for invalid token", async () => {
    await addSubscriber(env.DB, "alice@test.com");
    const ok = await verifySubscriber(env.DB, "bogus-token");
    expect(ok).toBe(false);
  });

  test("returns false if already verified", async () => {
    const { token } = (await addSubscriber(env.DB, "alice@test.com")) as {
      status: "sent";
      token: string;
    };
    await verifySubscriber(env.DB, token);

    const ok = await verifySubscriber(env.DB, token);
    expect(ok).toBe(false);
  });
});

describe("full lifecycle", () => {
  test("subscribe → verify → appears in verified list", async () => {
    const { token } = (await addSubscriber(env.DB, "alice@test.com")) as {
      status: "sent";
      token: string;
    };
    await verifySubscriber(env.DB, token);

    const verified = await getVerifiedSubscribers(env.DB);
    expect(verified).toEqual([{ email: "alice@test.com" }]);
  });

  test("subscribe → verify → unsubscribe → not in verified list", async () => {
    const { token } = (await addSubscriber(env.DB, "alice@test.com")) as {
      status: "sent";
      token: string;
    };
    await verifySubscriber(env.DB, token);
    await unsubscribe(env.DB, "alice@test.com");

    const verified = await getVerifiedSubscribers(env.DB);
    expect(verified).toEqual([]);
  });

  test("subscribe → verify → re-subscribe returns 'verified'", async () => {
    const { token } = (await addSubscriber(env.DB, "alice@test.com")) as {
      status: "sent";
      token: string;
    };
    await verifySubscriber(env.DB, token);

    const result = await addSubscriber(env.DB, "alice@test.com");
    expect(result.status).toBe("verified");
  });
});

describe("cleanupExpiredPending", () => {
  test("removes pending subscribers older than maxAgeHours", async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, created_at) VALUES (?, 'pending', datetime('now', '-3 hours'))"
    )
      .bind("old@test.com")
      .run();
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, created_at) VALUES (?, 'pending', datetime('now', '-1 hour'))"
    )
      .bind("recent@test.com")
      .run();

    const removed = await cleanupExpiredPending(env.DB, 2);
    expect(removed).toBe(1);

    const remaining = await env.DB.prepare("SELECT email FROM subscribers")
      .all<{ email: string }>();
    expect(remaining.results).toEqual([{ email: "recent@test.com" }]);
  });

  test("does not remove verified subscribers", async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, created_at, verified_at) VALUES (?, 'verified', datetime('now', '-3 hours'), datetime('now'))"
    )
      .bind("verified@test.com")
      .run();

    const removed = await cleanupExpiredPending(env.DB, 2);
    expect(removed).toBe(0);
  });

  test("does not remove unsubscribed users", async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, created_at) VALUES (?, 'unsubscribed', datetime('now', '-3 hours'))"
    )
      .bind("unsub@test.com")
      .run();

    const removed = await cleanupExpiredPending(env.DB, 2);
    expect(removed).toBe(0);
  });

  test("respects custom maxAgeHours", async () => {
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, created_at) VALUES (?, 'pending', datetime('now', '-30 minutes'))"
    )
      .bind("recent@test.com")
      .run();

    expect(await cleanupExpiredPending(env.DB, 1)).toBe(0);

    await env.DB.prepare(
      "UPDATE subscribers SET created_at = datetime('now', '-2 hours') WHERE email = ?"
    )
      .bind("recent@test.com")
      .run();
    expect(await cleanupExpiredPending(env.DB, 1)).toBe(1);
  });
});
