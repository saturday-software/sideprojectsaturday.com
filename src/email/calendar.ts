/** Generate a Google Calendar "Add to Calendar" URL. */
export function getCalendarLink(dateKey: string, address: string): string {
  const title = "Side Project Saturday";
  // Event runs 10am–2pm ET
  const start = dateKey.replace(/-/g, "") + "T140000Z"; // 10am ET = 2pm UTC
  const end = dateKey.replace(/-/g, "") + "T180000Z"; // 2pm ET = 6pm UTC

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    location: address,
    details: "Weekly meetup to work on side projects and share demos.",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
