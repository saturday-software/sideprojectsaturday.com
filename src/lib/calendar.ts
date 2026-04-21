/** RFC 5545 text escape: backslash, semicolon, comma, newline. */
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const TITLE = "Side Project Saturday";
const DESCRIPTION = "Weekly meetup to work on side projects and share demos.";

// Event runs 9am ET to noon ET (1pm UTC to 4pm UTC).
function eventTimes(dateKey: string): { start: string; end: string } {
  const base = dateKey.replace(/-/g, "");
  return { start: `${base}T130000Z`, end: `${base}T160000Z` };
}

/** Build the raw ICS body for a Side Project Saturday event. */
export function generateIcs(dateKey: string, address: string): string {
  const { start, end } = eventTimes(dateKey);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SideProjectSaturday//EN",
    "BEGIN:VEVENT",
    `UID:${dateKey}@sideprojectsaturday.com`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `DTSTAMP:${start}`,
    `SUMMARY:${icsEscape(TITLE)}`,
    `LOCATION:${icsEscape(address)}`,
    `DESCRIPTION:${icsEscape(DESCRIPTION)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Hosted .ics link. Apple Calendar, Fantastical, and most desktop calendar apps handle this well. */
export function getIcsUrl(siteUrl: string, dateKey: string): string {
  return `${siteUrl}/api/calendar/${dateKey}.ics`;
}

/** One-click "add to Google Calendar" link. */
export function getGoogleCalendarUrl(dateKey: string, address: string): string {
  const { start, end } = eventTimes(dateKey);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: TITLE,
    dates: `${start}/${end}`,
    details: DESCRIPTION,
    location: address,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
