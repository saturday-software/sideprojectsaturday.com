type AddSubscriberResult =
  | { status: "verified" }
  | { status: "rate_limited" }
  | { status: "sent"; token: string };

export async function addSubscriber(
  db: D1Database,
  email: string
): Promise<AddSubscriberResult> {
  const existing = await db
    .prepare("SELECT id, status, created_at FROM subscribers WHERE email = ?")
    .bind(email)
    .first<{ id: number; status: string; created_at: string }>();

  if (existing) {
    if (existing.status === "verified") {
      return { status: "verified" };
    }

    // Rate limit: don't resend if pending row was created/updated < 10 min ago
    const createdAt = new Date(existing.created_at + "Z").getTime();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (createdAt > tenMinutesAgo) {
      return { status: "rate_limited" };
    }

    // Refresh token and timestamp for pending/unsubscribed
    const token = crypto.randomUUID();
    await db
      .prepare(
        "UPDATE subscribers SET verification_token = ?, status = 'pending', created_at = datetime('now') WHERE email = ?"
      )
      .bind(token, email)
      .run();
    return { status: "sent", token };
  }

  const token = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO subscribers (email, status, verification_token) VALUES (?, 'pending', ?)"
    )
    .bind(email, token)
    .run();

  return { status: "sent", token };
}

export async function verifySubscriber(
  db: D1Database,
  token: string
): Promise<boolean> {
  const result = await db
    .prepare(
      "UPDATE subscribers SET status = 'verified', verified_at = datetime('now'), verification_token = NULL WHERE verification_token = ? AND status = 'pending'"
    )
    .bind(token)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function unsubscribe(
  db: D1Database,
  email: string
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE subscribers SET status = 'unsubscribed' WHERE email = ?")
    .bind(email)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

// Long TTL because mutations invalidate explicitly; the TTL is a safety net.
const LIST_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const VERIFIED_CACHE_KEY = "subscribers-verified";
const PARTICIPANTS_CACHE_KEY = "subscribers-participants";

export async function getVerifiedSubscribers(
  db: D1Database,
  cache: KVNamespace,
): Promise<{ email: string }[]> {
  const cached = await cache.get<string[]>(VERIFIED_CACHE_KEY, "json");
  if (cached) return cached.map((email) => ({ email }));

  const { results } = await db
    .prepare("SELECT email FROM subscribers WHERE status = 'verified'")
    .all<{ email: string }>();

  await cache.put(
    VERIFIED_CACHE_KEY,
    JSON.stringify(results.map((r) => r.email)),
    { expirationTtl: LIST_CACHE_TTL_SECONDS },
  );
  return results;
}

export async function getParticipants(
  db: D1Database,
  cache: KVNamespace,
): Promise<{ email: string }[]> {
  const cached = await cache.get<string[]>(PARTICIPANTS_CACHE_KEY, "json");
  if (cached) return cached.map((email) => ({ email }));

  const { results } = await db
    .prepare(
      "SELECT email FROM subscribers WHERE status = 'verified' AND is_participant = 1"
    )
    .all<{ email: string }>();

  await cache.put(
    PARTICIPANTS_CACHE_KEY,
    JSON.stringify(results.map((r) => r.email)),
    { expirationTtl: LIST_CACHE_TTL_SECONDS },
  );
  return results;
}

export async function markAsParticipant(
  db: D1Database,
  email: string
): Promise<void> {
  await db
    .prepare("UPDATE subscribers SET is_participant = 1 WHERE email = ?")
    .bind(email)
    .run();
}

export interface Subscriber {
  id: number;
  email: string;
  status: string;
  is_participant: number;
  created_at: string;
  verified_at: string | null;
}

export async function getSubscribers(
  db: D1Database,
  page: number,
  perPage: number
): Promise<{ subscribers: Subscriber[]; total: number }> {
  const offset = (page - 1) * perPage;

  const total = await db
    .prepare("SELECT COUNT(*) as count FROM subscribers")
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      "SELECT id, email, status, is_participant, created_at, verified_at FROM subscribers ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .bind(perPage, offset)
    .all<Subscriber>();

  return { subscribers: results, total: total?.count ?? 0 };
}

interface SubscriberCount {
  total: number;
  verified: number;
}

const COUNT_CACHE_KEY = "subscriber-count";
// Long TTL because mutations invalidate explicitly; the TTL is a safety net
// for missed invalidations (e.g. crashes between DB write and KV delete).
const COUNT_CACHE_TTL_SECONDS = 60 * 60 * 24;

export async function getSubscriberCount(
  db: D1Database,
  cache: KVNamespace,
): Promise<SubscriberCount> {
  const cached = await cache.get<SubscriberCount>(COUNT_CACHE_KEY, "json");
  if (cached) return cached;

  // One pass instead of two COUNT(*) scans.
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified FROM subscribers"
    )
    .first<{ total: number; verified: number | null }>();

  const counts: SubscriberCount = {
    total: row?.total ?? 0,
    verified: row?.verified ?? 0,
  };
  await cache.put(COUNT_CACHE_KEY, JSON.stringify(counts), {
    expirationTtl: COUNT_CACHE_TTL_SECONDS,
  });
  return counts;
}

export async function invalidateSubscriberCount(cache: KVNamespace): Promise<void> {
  await cache.delete(COUNT_CACHE_KEY);
}

export async function invalidateVerifiedList(cache: KVNamespace): Promise<void> {
  await cache.delete(VERIFIED_CACHE_KEY);
}

export async function invalidateParticipantsList(cache: KVNamespace): Promise<void> {
  await cache.delete(PARTICIPANTS_CACHE_KEY);
}

export async function deleteSubscriber(
  db: D1Database,
  id: number
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM subscribers WHERE id = ?")
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function generateUnsubscribeToken(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyUnsubscribeToken(email: string, token: string, secret: string): Promise<boolean> {
  const expected = await generateUnsubscribeToken(email, secret);
  return expected === token;
}

/** Delete pending subscribers whose verification expired. */
export async function cleanupExpiredPending(
  db: D1Database,
  maxAgeHours: number = 2
): Promise<number> {
  const result = await db
    .prepare(
      "DELETE FROM subscribers WHERE status = 'pending' AND created_at < datetime('now', ?)"
    )
    .bind(`-${maxAgeHours} hours`)
    .run();

  return result.meta?.changes ?? 0;
}
