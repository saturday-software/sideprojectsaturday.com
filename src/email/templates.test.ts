import { describe, expect, test } from "vitest";
import { broadcastEmail } from "./templates";

const SITE = "https://sideprojectsaturday.com";

describe("broadcastEmail", () => {
  test("uses the given subject verbatim", () => {
    const { subject } = broadcastEmail("Doors open at 10", "hi", SITE);
    expect(subject).toBe("Doors open at 10");
  });

  test("renders markdown into the shared email layout with an unsubscribe footer", () => {
    const { html, text } = broadcastEmail(
      "Subject",
      "**Big** news\nsee [the site](https://example.com)",
      SITE,
    );

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<strong>Big</strong> news");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain(`${SITE}/unsubscribe`);

    expect(text).toContain("Big news");
    expect(text).toContain("the site (https://example.com)");
    expect(text).toContain(`Unsubscribe: ${SITE}/unsubscribe`);
  });

  test("styles body links to match the rest of the email", () => {
    const { html } = broadcastEmail("Subject", "[link](https://example.com)", SITE);
    expect(html).toContain('<a style="color: #000000;" href="https://example.com"');
  });

  test("makes uploaded image URLs absolute so mail clients can load them", () => {
    const { html } = broadcastEmail("Subject", "![photo](/api/image/submissions/x.png)", SITE);
    expect(html).toContain(`src="${SITE}/api/image/submissions/x.png"`);
    expect(html).not.toContain('src="/api/image/');
  });

  test("escapes HTML in the composed message", () => {
    const { html } = broadcastEmail("Subject", "<script>alert(1)</script>", SITE);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
