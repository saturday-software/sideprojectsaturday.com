/** RFC 5545 text escape: backslash, semicolon, comma, newline. */
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Build the raw ICS body for a Side Project Saturday event. */
export function generateIcs(dateKey: string, address: string): string {
  const title = "Side Project Saturday";
  // Event runs 9am ET to noon ET (1pm UTC to 4pm UTC).
  const start = dateKey.replace(/-/g, "") + "T130000Z";
  const end = dateKey.replace(/-/g, "") + "T160000Z";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SideProjectSaturday//EN",
    "BEGIN:VEVENT",
    `UID:${dateKey}@sideprojectsaturday.com`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `DTSTAMP:${start}`,
    `SUMMARY:${icsEscape(title)}`,
    `LOCATION:${icsEscape(address)}`,
    `DESCRIPTION:${icsEscape("Weekly meetup to work on side projects and share demos.")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Hosted .ics link. Works in email clients that block data: URIs. */
export function getIcsUrl(siteUrl: string, dateKey: string): string {
  return `${siteUrl}/api/calendar/${dateKey}.ics`;
}
