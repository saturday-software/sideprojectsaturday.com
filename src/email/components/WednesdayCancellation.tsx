import { Text } from "@react-email/components";
import { Layout } from "./Layout";
import { Footer } from "./Footer";

interface WednesdayCancellationProps {
  siteUrl: string;
  eventDate: string;
}

export function WednesdayCancellation({
  siteUrl,
  eventDate,
}: WednesdayCancellationProps) {
  return (
    <Layout
      title="Side Project Saturday"
      preview={`${eventDate} has been cancelled`}
    >
      <Text style={body}>
        <strong>{eventDate}</strong> has been <strong>cancelled</strong>.
      </Text>
      <Text style={body}>We'll be back next week!</Text>
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
