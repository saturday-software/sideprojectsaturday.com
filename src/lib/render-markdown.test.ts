import { describe, it, expect } from "vitest";
import { renderMarkdown, markdownToText } from "./render-markdown";

describe("renderMarkdown", () => {
  it("keeps site-relative image URLs relative by default", () => {
    expect(renderMarkdown("![x](/api/image/a.png)")).toContain('src="/api/image/a.png"');
  });

  it("prefixes site-relative URLs with baseUrl", () => {
    const html = renderMarkdown("![x](/api/image/a.png?w=200) [y](/api/image/b.png)", {
      baseUrl: "https://example.com",
    });
    expect(html).toContain('src="https://example.com/api/image/a.png"');
    expect(html).toContain('href="https://example.com/api/image/b.png"');
  });

  it("still refuses non-https URLs", () => {
    expect(renderMarkdown("[x](javascript:alert(1))", { baseUrl: "https://example.com" })).not.toContain("<a");
  });
});

describe("markdownToText", () => {
  it("strips formatting and keeps link targets", () => {
    expect(markdownToText("**hi** _there_ [site](https://a.com) ![img](/api/image/x.png)", {
      baseUrl: "https://example.com",
    })).toBe("hi there site (https://a.com) img");
  });

  it("absolutizes relative link targets", () => {
    expect(markdownToText("[pic](/api/image/x.png)", { baseUrl: "https://example.com" }))
      .toBe("pic (https://example.com/api/image/x.png)");
  });
});
