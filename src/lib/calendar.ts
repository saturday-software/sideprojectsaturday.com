/** Generate a base64-encoded ICS data URI for an "Add to Calendar" link. */
export function getCalendarLink(dateKey: string, address: string): string {
  const title = "Side Project Saturday";
  // Event runs 9am–noon ET
  const start = dateKey.replace(/-/g, "") + "T130000Z"; // 9am ET = 1pm UTC
  const end = dateKey.replace(/-/g, "") + "T160000Z"; // noon ET = 4pm UTC
  const now = start; // use event start as DTSTAMP

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SideProjectSaturday//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${title}`,
    `LOCATION:${address}`,
    "DESCRIPTION:Weekly meetup to work on side projects and share demos.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const base64 = btoa(ics);
  return `data:text/calendar;base64,${base64}`;
}
