import { getCurrentSaturday } from "@/lib/dates";
import { isEventCancelled } from "@/lib/events";

const TZ = "America/New_York";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface DoorRule {
  id: number;
  day: number;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  enabled: number;
  event_only: number;
}

export function dayName(day: number): string {
  return DAY_NAMES[day] ?? String(day);
}

export function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  const m = String(minute).padStart(2, "0");
  return `${h}:${m} ${period}`;
}

/** Return the matching rules for a given day/time. Pure logic, no DB or TZ. */
export function matchRules(rules: DoorRule[], day: number, minuteOfDay: number): DoorRule[] {
  return rules.filter((r) => {
    if (r.day !== day) return false;
    const start = r.start_hour * 60 + r.start_minute;
    const end = r.end_hour * 60 + r.end_minute;
    return minuteOfDay >= start && minuteOfDay < end;
  });
}

/** Check if the door should be unlocked right now based on enabled rules. */
export async function isDoorOpen(db: D1Database, now: Date = new Date()): Promise<boolean> {
  const rules = await getEnabledRules(db);
  if (rules.length === 0) return false;

  const nyStr = now.toLocaleString("en-US", { timeZone: TZ });
  const ny = new Date(nyStr);
  const day = ny.getDay();
  const minutes = ny.getHours() * 60 + ny.getMinutes();

  const matching = matchRules(rules, day, minutes);
  if (matching.length === 0) return false;

  // If all matching rules require an active event, check cancellation
  const needsEventCheck = matching.every((r) => r.event_only);
  if (needsEventCheck) {
    const dateKey = getCurrentSaturday(now);
    if (await isEventCancelled(db, dateKey)) return false;
  }

  // At least one matching rule doesn't require an active event, or event is active
  return true;
}

export async function getRules(db: D1Database): Promise<DoorRule[]> {
  const { results } = await db
    .prepare("SELECT * FROM door_rules ORDER BY day, start_hour, start_minute")
    .all<DoorRule>();
  return results;
}

async function getEnabledRules(db: D1Database): Promise<DoorRule[]> {
  const { results } = await db
    .prepare("SELECT * FROM door_rules WHERE enabled = 1")
    .all<DoorRule>();
  return results;
}

export async function addRule(
  db: D1Database,
  day: number,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  eventOnly: boolean,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO door_rules (day, start_hour, start_minute, end_hour, end_minute, event_only) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(day, startHour, startMinute, endHour, endMinute, eventOnly ? 1 : 0)
    .run();
}

export async function deleteRule(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM door_rules WHERE id = ?").bind(id).run();
}

export async function toggleRule(db: D1Database, id: number): Promise<void> {
  await db
    .prepare("UPDATE door_rules SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?")
    .bind(id)
    .run();
}

export async function toggleEventOnly(db: D1Database, id: number): Promise<void> {
  await db
    .prepare("UPDATE door_rules SET event_only = CASE WHEN event_only = 1 THEN 0 ELSE 1 END WHERE id = ?")
    .bind(id)
    .run();
}
