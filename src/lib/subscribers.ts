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

export async function getVerifiedSubscribers(
  db: D1Database
): Promise<{ email: string }[]> {
  const { results } = await db
    .prepare("SELECT email FROM subscribers WHERE status = 'verified'")
    .all<{ email: string }>();

  return results;
}

export async function getParticipants(
  db: D1Database
): Promise<{ email: string }[]> {
  const { results } = await db
    .prepare(
      "SELECT email FROM subscribers WHERE status = 'verified' AND is_participant = 1"
    )
    .all<{ email: string }>();

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

export async function getSubscriberCount(
  db: D1Database
): Promise<{ total: number; verified: number }> {
  const total = await db
    .prepare("SELECT COUNT(*) as count FROM subscribers")
    .first<{ count: number }>();
  const verified = await db
    .prepare("SELECT COUNT(*) as count FROM subscribers WHERE status = 'verified'")
    .first<{ count: number }>();

  return {
    total: total?.count ?? 0,
    verified: verified?.count ?? 0,
  };
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
