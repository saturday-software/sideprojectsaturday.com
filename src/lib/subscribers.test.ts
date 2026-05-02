import { describe, expect, test, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  addSubscriber,
  verifySubscriber,
  unsubscribe,
  getVerifiedSubscribers,
  getParticipants,
  getSubscriberCount,
  markAsParticipant,
  deleteSubscriber,
  cleanupExpiredPending,
  invalidateSubscriberCount,
  invalidateVerifiedList,
  invalidateParticipantsList,
} from "@/lib/subscribers";

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending', is_participant INTEGER NOT NULL DEFAULT 0, verification_token TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), verified_at TEXT)";

beforeEach(async () => {
  await env.DB.exec("DROP TABLE IF EXISTS subscribers");
  await env.DB.exec(SCHEMA);
  const keys = await env.CACHE.list();
  await Promise.all(keys.keys.map((k) => env.CACHE.delete(k.name)));
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

    const verified = await getVerifiedSubscribers(env.DB, env.CACHE);
    expect(verified).toEqual([{ email: "alice@test.com" }]);
  });

  test("subscribe → verify → unsubscribe → not in verified list", async () => {
    const { token } = (await addSubscriber(env.DB, "alice@test.com")) as {
      status: "sent";
      token: string;
    };
    await verifySubscriber(env.DB, token);
    await unsubscribe(env.DB, "alice@test.com");

    const verified = await getVerifiedSubscribers(env.DB, env.CACHE);
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

// Helper: insert a verified subscriber directly without touching cache.
async function seedVerified(email: string, isParticipant = false): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO subscribers (email, status, is_participant, verified_at) VALUES (?, 'verified', ?, datetime('now'))"
  )
    .bind(email, isParticipant ? 1 : 0)
    .run();
}

describe("getSubscriberCount", () => {
  test("counts total and verified on cache miss", async () => {
    await seedVerified("a@test.com");
    await seedVerified("b@test.com");
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status) VALUES (?, 'pending')"
    )
      .bind("c@test.com")
      .run();

    const counts = await getSubscriberCount(env.DB, env.CACHE);
    expect(counts).toEqual({ total: 3, verified: 2 });
  });

  test("returns 0/0 for empty table", async () => {
    const counts = await getSubscriberCount(env.DB, env.CACHE);
    expect(counts).toEqual({ total: 0, verified: 0 });
  });

  test("populates the cache after a miss", async () => {
    await seedVerified("a@test.com");

    expect(await env.CACHE.get("subscriber-count")).toBeNull();
    await getSubscriberCount(env.DB, env.CACHE);
    expect(await env.CACHE.get("subscriber-count", "json")).toEqual({
      total: 1,
      verified: 1,
    });
  });

  test("returns stale cached value when DB changes without invalidation", async () => {
    await seedVerified("a@test.com");
    await getSubscriberCount(env.DB, env.CACHE); // populate cache

    await seedVerified("b@test.com"); // mutate DB without invalidating

    const counts = await getSubscriberCount(env.DB, env.CACHE);
    expect(counts).toEqual({ total: 1, verified: 1 });
  });

  test("invalidateSubscriberCount forces a recompute on next read", async () => {
    await seedVerified("a@test.com");
    await getSubscriberCount(env.DB, env.CACHE);

    await seedVerified("b@test.com");
    await invalidateSubscriberCount(env.CACHE);

    const counts = await getSubscriberCount(env.DB, env.CACHE);
    expect(counts).toEqual({ total: 2, verified: 2 });
  });
});

describe("getVerifiedSubscribers cache", () => {
  test("returns DB rows on cache miss", async () => {
    await seedVerified("a@test.com");
    await seedVerified("b@test.com");

    const verified = await getVerifiedSubscribers(env.DB, env.CACHE);
    expect(verified.map((r) => r.email).sort()).toEqual([
      "a@test.com",
      "b@test.com",
    ]);
  });

  test("populates cache as a string[]", async () => {
    await seedVerified("a@test.com");
    await getVerifiedSubscribers(env.DB, env.CACHE);

    expect(await env.CACHE.get("subscribers-verified", "json")).toEqual([
      "a@test.com",
    ]);
  });

  test("returns cached list when DB changes without invalidation", async () => {
    await seedVerified("a@test.com");
    await getVerifiedSubscribers(env.DB, env.CACHE);

    await seedVerified("b@test.com");

    const verified = await getVerifiedSubscribers(env.DB, env.CACHE);
    expect(verified).toEqual([{ email: "a@test.com" }]);
  });

  test("invalidateVerifiedList forces a fresh read", async () => {
    await seedVerified("a@test.com");
    await getVerifiedSubscribers(env.DB, env.CACHE);

    await seedVerified("b@test.com");
    await invalidateVerifiedList(env.CACHE);

    const verified = await getVerifiedSubscribers(env.DB, env.CACHE);
    expect(verified.map((r) => r.email).sort()).toEqual([
      "a@test.com",
      "b@test.com",
    ]);
  });
});

describe("getParticipants cache", () => {
  test("returns only verified participants on cache miss", async () => {
    await seedVerified("nonparticipant@test.com", false);
    await seedVerified("participant@test.com", true);
    await env.DB.prepare(
      "INSERT INTO subscribers (email, status, is_participant) VALUES (?, 'pending', 1)"
    )
      .bind("pending-participant@test.com")
      .run();

    const participants = await getParticipants(env.DB, env.CACHE);
    expect(participants).toEqual([{ email: "participant@test.com" }]);
  });

  test("populates cache as a string[]", async () => {
    await seedVerified("p@test.com", true);
    await getParticipants(env.DB, env.CACHE);

    expect(await env.CACHE.get("subscribers-participants", "json")).toEqual([
      "p@test.com",
    ]);
  });

  test("invalidateParticipantsList forces a fresh read", async () => {
    await seedVerified("a@test.com", true);
    await getParticipants(env.DB, env.CACHE);

    await seedVerified("b@test.com", true);
    await invalidateParticipantsList(env.CACHE);

    const participants = await getParticipants(env.DB, env.CACHE);
    expect(participants.map((r) => r.email).sort()).toEqual([
      "a@test.com",
      "b@test.com",
    ]);
  });

  test("verified-list and participants-list caches are independent", async () => {
    await seedVerified("a@test.com", true);
    await getVerifiedSubscribers(env.DB, env.CACHE);
    await getParticipants(env.DB, env.CACHE);

    await invalidateParticipantsList(env.CACHE);

    expect(await env.CACHE.get("subscribers-verified")).not.toBeNull();
    expect(await env.CACHE.get("subscribers-participants")).toBeNull();
  });
});

describe("mutation helpers leave cache untouched", () => {
  // The lib mutation functions intentionally do NOT touch KV — invalidation
  // is the caller's responsibility. These tests pin that contract so a future
  // refactor that bakes in cache invalidation is a deliberate choice.

  test("verifySubscriber does not invalidate any cache", async () => {
    const { token } = (await addSubscriber(env.DB, "a@test.com")) as {
      status: "sent";
      token: string;
    };
    await env.CACHE.put("subscriber-count", JSON.stringify({ total: 99, verified: 99 }));
    await env.CACHE.put("subscribers-verified", JSON.stringify(["stale@test.com"]));

    await verifySubscriber(env.DB, token);

    expect(await env.CACHE.get("subscriber-count")).not.toBeNull();
    expect(await env.CACHE.get("subscribers-verified")).not.toBeNull();
  });

  test("unsubscribe does not invalidate any cache", async () => {
    await seedVerified("a@test.com", true);
    await env.CACHE.put("subscribers-verified", JSON.stringify(["a@test.com"]));
    await env.CACHE.put("subscribers-participants", JSON.stringify(["a@test.com"]));

    await unsubscribe(env.DB, "a@test.com");

    expect(await env.CACHE.get("subscribers-verified")).not.toBeNull();
    expect(await env.CACHE.get("subscribers-participants")).not.toBeNull();
  });

  test("markAsParticipant does not invalidate any cache", async () => {
    await seedVerified("a@test.com");
    await env.CACHE.put("subscribers-participants", JSON.stringify([]));

    await markAsParticipant(env.DB, "a@test.com");

    expect(await env.CACHE.get("subscribers-participants")).not.toBeNull();
  });

  test("deleteSubscriber does not invalidate any cache", async () => {
    await seedVerified("a@test.com");
    const row = await env.DB.prepare("SELECT id FROM subscribers WHERE email = ?")
      .bind("a@test.com")
      .first<{ id: number }>();
    await env.CACHE.put("subscriber-count", JSON.stringify({ total: 1, verified: 1 }));

    await deleteSubscriber(env.DB, row!.id);

    expect(await env.CACHE.get("subscriber-count")).not.toBeNull();
  });
});
