/** Build the raw ICS body for a Side Project Saturday event. */
export function generateIcs(dateKey: string, address: string): string {
  const title = "Side Project Saturday";
  // Event runs 9am ET to noon ET (1pm UTC to 4pm UTC).
  const start = dateKey.replace(/-/g, "") + "T130000Z";
  const end = dateKey.replace(/-/g, "") + "T160000Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SideProjectSaturday//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `DTSTAMP:${start}`,
    `SUMMARY:${title}`,
    `LOCATION:${address}`,
    "DESCRIPTION:Weekly meetup to work on side projects and share demos.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Hosted .ics link. Works in email clients that block data: URIs. */
export function getIcsUrl(siteUrl: string, dateKey: string): string {
  return `${siteUrl}/api/calendar/${dateKey}.ics`;
}
