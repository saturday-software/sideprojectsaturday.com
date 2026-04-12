import { Hr, Text, Link } from "@react-email/components";

interface FooterProps {
  siteUrl: string;
}

export function Footer({ siteUrl }: FooterProps) {
  return (
    <>
      <Hr style={{ border: "none", borderTop: "1px solid #000", margin: "16px 0" }} />
      <Text
        style={{
          color: "#666",
          fontSize: "11px",
          fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
        }}
      >
        <Link
          href={`${siteUrl}/unsubscribe?email=%%EMAIL%%`}
          style={{ color: "#666" }}
        >
          Unsubscribe
        </Link>
      </Text>
    </>
  );
}
