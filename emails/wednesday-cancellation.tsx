import { WednesdayCancellation } from "../src/email/components/WednesdayCancellation";

export default function Preview() {
  return (
    <WednesdayCancellation
      siteUrl="https://sideprojectsaturday.com"
      eventDate="Saturday, April 18, 2026"
    />
  );
}
