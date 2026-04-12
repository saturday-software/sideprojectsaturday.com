import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Row,
  Column,
  Preview,
  Font,
} from "@react-email/components";
import type { ReactNode } from "react";

interface LayoutProps {
  title: string;
  preview?: string;
  children: ReactNode;
}

const stripeCell = {
  backgroundColor: "#fff",
  backgroundImage: "linear-gradient(#000 50%, transparent 50%)",
  backgroundSize: "100% 3px",
  width: "50%",
};

const titleCell = {
  backgroundColor: "#fff",
  padding: "0 8px",
  fontSize: "16px",
  fontWeight: "bold" as const,
  fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
  letterSpacing: "-0.02em",
  color: "#000",
  textAlign: "center" as const,
  whiteSpace: "nowrap" as const,
};

export function Layout({ title, preview, children }: LayoutProps) {
  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <style>{`:root, body { color-scheme: light only; }`}</style>
        <Font
          fontFamily="Departure Mono"
          fallbackFontFamily={["Courier New", "Courier", "monospace"]}
          webFont={{
            url: "https://sideprojectsaturday.com/DepartureMono-Regular.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body
        style={{
          fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
          margin: "0",
          padding: "32px 16px",
          color: "#000",
          fontSize: "13px",
          lineHeight: "1.6",
          backgroundColor: "#fff",
        }}
      >
        <Container style={{ maxWidth: "560px", margin: "0 auto" }}>
          <Section style={{ border: "2px solid #000", backgroundColor: "#fff" }}>
            {/* Title bar */}
            <Row>
              <Column style={{ padding: "5px 2px" }}>
                <table
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={{ borderCollapse: "collapse" }}
                >
                  <tr>
                    <td style={stripeCell}>&nbsp;</td>
                    <td style={titleCell}>{title}</td>
                    <td style={stripeCell}>&nbsp;</td>
                  </tr>
                </table>
              </Column>
            </Row>

            {/* Separator */}
            <Row>
              <Column
                style={{
                  borderTop: "1px solid #000",
                  fontSize: "0",
                  lineHeight: "0",
                  height: "1px",
                }}
              />
            </Row>

            {/* Content */}
            <Row>
              <Column style={{ padding: "20px" }}>{children}</Column>
            </Row>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
