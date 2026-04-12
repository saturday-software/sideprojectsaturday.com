import { Heading, Text, Link, Section } from "@react-email/components";
import { Layout } from "./Layout";
import { Button } from "./Button";
import { Footer } from "./Footer";

interface LastWeekProject {
  participant_name: string;
  description: string;
}

interface WednesdayAnnouncementProps {
  siteUrl: string;
  eventDate: string;
  address: string;
  calendarLink: string;
  submitLink: string;
  lastWeekProjects?: LastWeekProject[];
  lastWeekRecapLink?: string;
}

export function WednesdayAnnouncement({
  siteUrl,
  eventDate,
  address,
  calendarLink,
  submitLink,
  lastWeekProjects,
  lastWeekRecapLink,
}: WednesdayAnnouncementProps) {
  return (
    <Layout
      title="Side Project Saturday"
      preview={`${eventDate} — Come work on your side projects!`}
    >
      <Text style={body}>
        <strong>{eventDate}</strong>
      </Text>
      <Text style={body}>{address}</Text>
      <Text style={body}>
        <Link href={calendarLink} style={link}>
          Add to Calendar
        </Link>
      </Text>
      <Text style={body}>
        Come work on your side projects and share what you've been building!
      </Text>
      <Button href={submitLink}>Submit a project</Button>

      {lastWeekProjects && lastWeekProjects.length > 0 && (
        <Section style={{ marginTop: "24px" }}>
          <Heading as="h2" style={sectionHeading}>
            Last Week's Projects
          </Heading>
          {lastWeekProjects.map((s, i) => (
            <Text key={i} style={body}>
              - <strong>{s.participant_name}</strong>
              {s.description ? ` — ${s.description}` : ""}
            </Text>
          ))}
          {lastWeekRecapLink && (
            <Text style={body}>
              <Link href={lastWeekRecapLink} style={link}>
                View full recap →
              </Link>
            </Text>
          )}
        </Section>
      )}

      <Footer siteUrl={siteUrl} />
    </Layout>
  );
}

const body = {
  fontSize: "13px",
  fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
  lineHeight: "1.6",
  margin: "0 0 12px 0",
};

const sectionHeading = {
  fontSize: "14px",
  fontWeight: "normal" as const,
  fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 6px 0",
};

const link = {
  color: "#000",
  textDecoration: "underline",
};
