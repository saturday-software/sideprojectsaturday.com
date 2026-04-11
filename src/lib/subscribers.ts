export async function addSubscriber(
  db: D1Database,
  email: string
): Promise<{ token: string; existing: boolean }> {
  const token = crypto.randomUUID();

  // Check if already exists
  const existing = await db
    .prepare("SELECT id, status FROM subscribers WHERE email = ?")
    .bind(email)
    .first<{ id: number; status: string }>();

  if (existing) {
    if (existing.status === "verified") {
      return { token: "", existing: true };
    }
    // Re-send verification for pending subscribers
    await db
      .prepare("UPDATE subscribers SET verification_token = ? WHERE email = ?")
      .bind(token, email)
      .run();
    return { token, existing: false };
  }

  await db
    .prepare(
      "INSERT INTO subscribers (email, status, verification_token) VALUES (?, 'pending', ?)"
    )
    .bind(email, token)
    .run();

  return { token, existing: false };
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
