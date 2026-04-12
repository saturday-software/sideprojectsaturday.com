import { Heading, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { Button } from "./Button";

interface VerificationEmailProps {
  siteUrl: string;
  token: string;
}

export function VerificationEmail({ siteUrl, token }: VerificationEmailProps) {
  return (
    <Layout
      title="Side Project Saturday"
      preview="Confirm your subscription to Side Project Saturday"
    >
      <Heading as="h2" style={h2}>
        Welcome!
      </Heading>
      <Text style={body}>
        Click the link below to confirm your subscription:
      </Text>
      <Button href={`${siteUrl}/verify?token=${token}`}>Confirm Email</Button>
      <Text style={{ ...body, color: "#666", fontSize: "11px", marginTop: "16px" }}>
        If you didn't sign up, you can ignore this email.
      </Text>
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
