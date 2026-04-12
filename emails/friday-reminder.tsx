import { FridayReminder } from "../src/email/components/FridayReminder";

export default function Preview() {
  return (
    <FridayReminder
      siteUrl="https://sideprojectsaturday.com"
      eventDate="Saturday, April 18, 2026"
      address="123 Main St, Brooklyn, NY"
      calendarLink="#"
      submitLink="https://sideprojectsaturday.com/share/abc123"
    />
  );
}
