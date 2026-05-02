import { dateKeyToSlug, slugToDateKey } from "@/lib/dates";

export function eventImageKey(slug: string): string {
  return `events/${slug}/image`;
}

const EVENT_IMAGE_KEY_RE = /^events\/(\d{6})\/image$/;

export function parseEventImageKey(key: string): string | null {
  const m = EVENT_IMAGE_KEY_RE.exec(key);
  return m ? m[1] : null;
}

export interface EventRow {
  date: number;
  cancelled: number;
}

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

export async function listPastEvents(db: D1Database, beforeDate: string): Promise<EventRow[]> {
  const slug = Number(dateKeyToSlug(beforeDate));
  const { results } = await db
    .prepare("SELECT date, cancelled FROM events WHERE date < ? ORDER BY date DESC")
    .bind(slug)
    .all<EventRow>();
  return results;
}

const LATEST_EVENT_IMAGE_KEY = "latest-event-image";

interface LatestEventImage {
  slug: string;
  date: string;
}

/**
 * Returns the most recent event slug that has a recap image in R2.
 * Cached in KV; on miss, falls back to a single R2 list and repopulates.
 */
export async function getLatestEventImage(
  cache: KVNamespace,
  bucket: R2Bucket,
): Promise<LatestEventImage | null> {
  const cached = await cache.get<LatestEventImage>(LATEST_EVENT_IMAGE_KEY, "json");
  if (cached) return cached;

  const fresh = await findLatestEventImageFromR2(bucket);
  if (fresh) {
    await cache.put(LATEST_EVENT_IMAGE_KEY, JSON.stringify(fresh));
  }
  return fresh;
}

/** Update the cached latest-image pointer if the new upload is the most recent. */
export async function recordEventImageUpload(cache: KVNamespace, slug: string): Promise<void> {
  const cached = await cache.get<LatestEventImage>(LATEST_EVENT_IMAGE_KEY, "json");
  if (!cached || slug >= cached.slug) {
    await cache.put(
      LATEST_EVENT_IMAGE_KEY,
      JSON.stringify({ slug, date: slugToDateKey(slug) } satisfies LatestEventImage),
    );
  }
}

/** If the deleted image was the cached latest, recompute it from R2. */
export async function recordEventImageDelete(
  cache: KVNamespace,
  bucket: R2Bucket,
  slug: string,
): Promise<void> {
  const cached = await cache.get<LatestEventImage>(LATEST_EVENT_IMAGE_KEY, "json");
  if (!cached || cached.slug !== slug) return;

  const fresh = await findLatestEventImageFromR2(bucket);
  if (fresh) {
    await cache.put(LATEST_EVENT_IMAGE_KEY, JSON.stringify(fresh));
  } else {
    await cache.delete(LATEST_EVENT_IMAGE_KEY);
  }
}

async function findLatestEventImageFromR2(bucket: R2Bucket): Promise<LatestEventImage | null> {
  let cursor: string | undefined;
  let maxSlug: string | null = null;
  do {
    const list = await bucket.list({ prefix: "events/", limit: 1000, cursor });
    for (const obj of list.objects) {
      const slug = parseEventImageKey(obj.key);
      if (slug && (maxSlug === null || slug > maxSlug)) {
        maxSlug = slug;
      }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  if (!maxSlug) return null;
  return { slug: maxSlug, date: slugToDateKey(maxSlug) };
}
