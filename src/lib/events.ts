import { dateKeyToSlug } from "@/lib/dates";

export async function ensureEvent(db: D1Database, dateKey: string): Promise<void> {
  const slug = Number(dateKeyToSlug(dateKey));
  await db
    .prepare("INSERT OR IGNORE INTO events (date) VALUES (?)")
    .bind(slug)
    .run();
}

export async function isEventCancelled(db: D1Database, dateKey: string): Promise<boolean> {
  const slug = Number(dateKeyToSlug(dateKey));
  const row = await db
    .prepare("SELECT cancelled FROM events WHERE date = ?")
    .bind(slug)
    .first<{ cancelled: number }>();
  return row?.cancelled === 1;
}

export async function setEventCancelled(db: D1Database, dateKey: string, cancelled: boolean): Promise<void> {
  const slug = Number(dateKeyToSlug(dateKey));
  await db
    .prepare("UPDATE events SET cancelled = ? WHERE date = ?")
    .bind(cancelled ? 1 : 0, slug)
    .run();
}
