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

/** Get the upcoming Saturday for the next event. On Saturday after noon ET, returns next Saturday. */
export function getCurrentSaturday(now: Date = new Date()): string {
  const { y, m, d, weekday } = nyParts(now);
  const base = pad(y, m, d);
  if (weekday === 6) {
    const hourNY = parseInt(
      now.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }),
      10,
    );
    return hourNY >= 12 ? addDays(base, 7) : base;
  }
  if (weekday === 0) return addDays(base, 6); // Sunday → next Saturday
  return addDays(base, 6 - weekday); // Mon–Fri → this Saturday
}

/** Get the next N Saturdays starting from the upcoming one. Skips today if the event has ended (Saturday >= startHour ET, default noon). */
export function getUpcomingSaturdays(count: number, startHour: number = 12, now: Date = new Date()): string[] {
  const { y, m, d, weekday } = nyParts(now);
  const base = pad(y, m, d);

  let first: string;
  if (weekday === 6) {
    const hourNY = parseInt(
      now.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }),
      10,
    );
    first = hourNY >= startHour ? addDays(base, 7) : base;
  } else if (weekday === 0) {
    first = addDays(base, 6);
  } else {
    first = addDays(base, 6 - weekday);
  }

  const results: string[] = [first];
  for (let i = 1; i < count; i++) {
    results.push(addDays(first, 7 * i));
  }
  return results;
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

/** Convert a YYYY-MM-DD date key to a YYMMDD URL slug. */
export function dateKeyToSlug(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return y.slice(2) + m + d;
}

/** Convert a YYMMDD URL slug to a YYYY-MM-DD date key. */
export function slugToDateKey(slug: string): string {
  const yy = slug.slice(0, 2);
  const mm = slug.slice(2, 4);
  const dd = slug.slice(4, 6);
  const year = parseInt(yy, 10) >= 70 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}

/** Get today's date key in NY time. */
export function todayDateKey(now: Date = new Date()): string {
  const { y, m, d } = nyParts(now);
  return pad(y, m, d);
}

/** Check if a date key falls on a Saturday. */
export function isSaturday(dateKey: string): boolean {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 6;
}

/** Check if current time is within Saturday event hours (9am–12pm ET). */
export function isWithinEventHours(now: Date = new Date()): boolean {
  const { weekday } = nyParts(now);
  if (weekday !== 6) return false;
  const hourNY = parseInt(
    now.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }),
    10,
  );
  return hourNY >= 9 && hourNY < 12;
}

/** Check if submission window is open: only during the Saturday of the event in ET (closes at end of day Saturday). */
export function isSubmissionOpen(saturdayKey: string, now: Date = new Date()): boolean {
  return isSaturday(saturdayKey) && todayDateKey(now) === saturdayKey;
}
