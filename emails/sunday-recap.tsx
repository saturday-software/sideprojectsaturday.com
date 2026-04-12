import { SundayRecap } from "../src/email/components/SundayRecap";

export default function Preview() {
  return (
    <SundayRecap
      siteUrl="https://sideprojectsaturday.com"
      eventDate="Saturday, April 18, 2026"
      submissions={[
        {
          participant_name: "Alice",
          description: "Built a CLI tool for managing dotfiles with symlinks and backup support.",
          contact_info: "alice@example.com",
        },
        {
          participant_name: "Bob",
          description: "Worked on a recipe app that uses AI to suggest meals based on pantry ingredients.",
          contact_info: "@bob_cooks",
          private_details: "Looking for a co-founder for this project",
        },
        {
          participant_name: "Charlie",
          description: "Prototyped a real-time multiplayer board game using WebSockets.",
        },
      ]}
    />
  );
}
