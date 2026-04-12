/** Generate a base64-encoded ICS data URI for an "Add to Calendar" link. */
export function getCalendarLink(dateKey: string, address: string): string {
  const title = "Side Project Saturday";
  // Event runs 10am–2pm ET
  const start = dateKey.replace(/-/g, "") + "T140000Z"; // 10am ET = 2pm UTC
  const end = dateKey.replace(/-/g, "") + "T180000Z"; // 2pm ET = 6pm UTC
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
