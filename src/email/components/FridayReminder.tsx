import { Heading, Text, Link } from "@react-email/components";
import { Layout } from "./Layout";
import { Button } from "./Button";
import { Footer } from "./Footer";

interface FridayReminderProps {
  siteUrl: string;
  eventDate: string;
  address: string;
  calendarLink: string;
  submitLink: string;
}

export function FridayReminder({
  siteUrl,
  eventDate,
  address,
  calendarLink,
  submitLink,
}: FridayReminderProps) {
  return (
    <Layout
      title="Side Project Saturday"
      preview={`${eventDate} is tomorrow!`}
    >
      <Heading as="h2" style={h2}>
        See you tomorrow!
      </Heading>
      <Text style={body}>
        <strong>{eventDate}</strong>
      </Text>
      <Text style={body}>{address}</Text>
      <Text style={body}>
        <Link href={calendarLink} style={link}>
          Add to Calendar
        </Link>
      </Text>
      <Button href={submitLink}>Submit a project</Button>
      <Footer siteUrl={siteUrl} />
    </Layout>
  );
}

const h2 = {
  fontSize: "18px",
  fontWeight: "normal" as const,
  fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
  margin: "0 0 8px 0",
};

const body = {
  fontSize: "13px",
  fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
  lineHeight: "1.6",
  margin: "0 0 12px 0",
};

const link = {
  color: "#000",
  textDecoration: "underline",
};
