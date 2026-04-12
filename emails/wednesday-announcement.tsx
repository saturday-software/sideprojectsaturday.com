import { WednesdayAnnouncement } from "../src/email/components/WednesdayAnnouncement";

export default function Preview() {
  return (
    <WednesdayAnnouncement
      siteUrl="https://sideprojectsaturday.com"
      eventDate="Saturday, April 18, 2026"
      address="123 Main St, Brooklyn, NY"
      calendarLink="#"
      submitLink="https://sideprojectsaturday.com/share/abc123"
      lastWeekProjects={[
        {
          participant_name: "Alice",
          description: "Built a CLI tool for managing dotfiles",
        },
        {
          participant_name: "Bob",
          description: "Worked on a recipe app with AI suggestions",
        },
        {
          participant_name: "Charlie",
          description: "Prototyped a multiplayer board game",
        },
      ]}
      lastWeekRecapLink="https://sideprojectsaturday.com/events/2026-04-11"
    />
  );
}
