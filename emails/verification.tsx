import { VerificationEmail } from "../src/email/components/VerificationEmail";

export default function Preview() {
  return (
    <VerificationEmail
      siteUrl="https://sideprojectsaturday.com"
      token="abc123-preview-token"
    />
  );
}
