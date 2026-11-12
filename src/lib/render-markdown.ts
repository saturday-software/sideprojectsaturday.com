function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface RenderOptions {
  /** Prefix for site-relative URLs (e.g. /api/image/...). Needed when the HTML leaves the site, as in email. */
  baseUrl?: string;
}

function sanitizeUrl(url: string, baseUrl = ""): string | null {
  if (url.startsWith("/api/image/")) return `${baseUrl}${url}`;
  if (url.startsWith("https://")) return url;
  return null;
}

function renderImage(alt: string, rawUrl: string, baseUrl?: string): string {
  // Parse ?w= query param for width
  let url = rawUrl;
  let width: string | null = null;
  const wMatch = rawUrl.match(/^(.+?)\?w=(\d+)$/);
  if (wMatch) {
    url = wMatch[1];
    width = wMatch[2];
  }
  const safe = sanitizeUrl(url, baseUrl);
  if (!safe) return escapeHtml(`![${alt}](${rawUrl})`);
  const style = width ? `width: ${width}px; max-width: 100%;` : "max-width: 100%;";
  return `<img src="${safe}" alt="${escapeHtml(alt)}" style="${style}">`;
}

export function renderMarkdown(text: string, options: RenderOptions = {}): string {
  if (!text) return "";
  const { baseUrl } = options;
  let html = escapeHtml(text);

  // Images: ![alt](url) or ![alt](url?w=300)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => renderImage(alt, url, baseUrl));

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safe = sanitizeUrl(url, baseUrl);
    if (!safe) return escapeHtml(`[${text}](${url})`);
    return `<a href="${safe}" target="_blank" rel="noopener">${text}</a>`;
  });

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: _text_
  html = html.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

/** Plain-text version of the same markdown subset, for the text/plain part of an email. */
export function markdownToText(text: string, options: RenderOptions = {}): string {
  const { baseUrl = "" } = options;
  const abs = (url: string) => (url.startsWith("/") ? `${baseUrl}${url}` : url);
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `${label} (${abs(url)})`)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1");
}
