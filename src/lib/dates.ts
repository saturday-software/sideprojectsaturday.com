/** Get the Saturday of the current week (or the coming Saturday if today is Sunday). */
export function getCurrentSaturday(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const diff = day <= 6 ? 6 - day : 0;
  const saturday = new Date(now);
  // If it's Sunday, move to next Saturday
  if (day === 0) {
    saturday.setUTCDate(saturday.getUTCDate() + 6);
  } else {
    saturday.setUTCDate(saturday.getUTCDate() + diff);
  }
  return formatDateKey(saturday);
}

/** Get the previous Saturday relative to a given date key. */
export function getPreviousSaturday(dateKey: string): string {
  const d = parseDate(dateKey);
  d.setUTCDate(d.getUTCDate() - 7);
  return formatDateKey(d);
}

/** Get the next Saturday relative to a given date key. */
export function getNextSaturday(dateKey: string): string {
  const d = parseDate(dateKey);
  d.setUTCDate(d.getUTCDate() + 7);
  return formatDateKey(d);
}

/** Human-readable format: "Saturday, April 12, 2026" */
export function formatEventDate(dateKey: string): string {
  const d = parseDate(dateKey);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** YYYY-MM-DD format */
function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(dateKey: string): Date {
  return new Date(dateKey + "T00:00:00Z");
}

/** Check if submission window is open (before Sunday midnight ET for a given Saturday). */
export function isSubmissionOpen(saturdayKey: string, now: Date = new Date()): boolean {
  const saturday = parseDate(saturdayKey);
  // Submission window closes Sunday 11:59pm ET (Monday 4am UTC)
  const deadline = new Date(saturday);
  deadline.setUTCDate(deadline.getUTCDate() + 2); // Monday
  deadline.setUTCHours(4, 0, 0, 0); // 4am UTC = midnight ET
  return now < deadline;
}
