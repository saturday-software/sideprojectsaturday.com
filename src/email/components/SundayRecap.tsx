import { Heading, Text, Img, Section } from "@react-email/components";
import { Layout } from "./Layout";
import { Footer } from "./Footer";

interface RecapSubmission {
  participant_name: string;
  description: string;
  contact_info?: string;
  private_details?: string;
}

interface SundayRecapProps {
  siteUrl: string;
  eventDate: string;
  imageUrl?: string;
  submissions: RecapSubmission[];
}

export function SundayRecap({
  siteUrl,
  eventDate,
  imageUrl,
  submissions,
}: SundayRecapProps) {
  return (
    <Layout title="Side Project Saturday" preview={`Recap for ${eventDate}`}>
      <Heading as="h2" style={sectionHeading}>
        This Week's Recap
      </Heading>
      <Text style={body}>
        <strong>{eventDate}</strong>
      </Text>

      {imageUrl && (
        <Img
          src={imageUrl}
          alt="Event photo"
          style={{
            maxWidth: "100%",
            border: "1px solid #000",
            marginBottom: "16px",
          }}
        />
      )}

      {submissions.length > 0 ? (
        submissions.map((s, i) => (
          <Section
            key={i}
            style={{
              marginBottom: "12px",
              padding: "12px",
              border: "1px solid #000",
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ ...body, fontWeight: "bold", margin: "0 0 4px 0" }}>
              {s.participant_name}
            </Text>
            <Text style={{ ...body, margin: "0 0 4px 0" }}>
              {s.description}
            </Text>
            {s.contact_info && (
              <Text style={{ ...body, color: "#666", margin: "0 0 4px 0" }}>
                Contact: {s.contact_info}
              </Text>
            )}
            {s.private_details && (
              <Text
                style={{
                  ...body,
                  color: "#666",
                  fontStyle: "italic",
                  margin: "0",
                }}
              >
                {s.private_details}
              </Text>
            )}
          </Section>
        ))
      ) : (
        <Text style={body}>No projects were submitted this week.</Text>
      )}

      <Footer siteUrl={siteUrl} />
    </Layout>
  );
}

const sectionHeading = {
  fontSize: "14px",
  fontWeight: "normal" as const,
  fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 6px 0",
};

const body = {
  fontSize: "13px",
  fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
  lineHeight: "1.6",
  margin: "0 0 12px 0",
};
