const TZ = "America/New_York";

/** Get the current date parts in New York time. */
function nyParts(now: Date = new Date()) {
  const s = now.toLocaleDateString("en-CA", { timeZone: TZ }); // "YYYY-MM-DD"
  const [y, m, d] = s.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay(); // 0=Sun, 6=Sat
  return { y, m, d, weekday };
}

/** Format a NY date as YYYY-MM-DD. */
function pad(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Add days to a date key. */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return pad(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Get the Saturday of the current week (or the coming Saturday if today is Sunday). */
export function getCurrentSaturday(now: Date = new Date()): string {
  const { y, m, d, weekday } = nyParts(now);
  const base = pad(y, m, d);
  if (weekday === 6) return base; // Saturday
  if (weekday === 0) return addDays(base, 6); // Sunday → next Saturday
  return addDays(base, 6 - weekday); // Mon–Fri → this Saturday
}

/** Get the previous Saturday relative to a given date key. */
export function getPreviousSaturday(dateKey: string): string {
  return addDays(dateKey, -7);
}

/** Get the next Saturday relative to a given date key. */
export function getNextSaturday(dateKey: string): string {
  return addDays(dateKey, 7);
}

/** Human-readable format: "2026-04-12" */
export function formatEventDate(dateKey: string): string {
  return dateKey;
}

/** Check if submission window is open (before Sunday midnight ET for a given Saturday). */
export function isSubmissionOpen(saturdayKey: string, now: Date = new Date()): boolean {
  // Compare current NY date to the deadline (end of Sunday)
  const nowNY = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const sunday = addDays(saturdayKey, 1);
  return nowNY <= sunday;
}
