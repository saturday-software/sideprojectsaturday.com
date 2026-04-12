function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeUrl(url: string): string | null {
  if (url.startsWith("/api/image/") || url.startsWith("https://")) return url;
  return null;
}

function renderImage(alt: string, rawUrl: string): string {
  // Parse ?w= query param for width
  let url = rawUrl;
  let width: string | null = null;
  const wMatch = rawUrl.match(/^(.+?)\?w=(\d+)$/);
  if (wMatch) {
    url = wMatch[1];
    width = wMatch[2];
  }
  const safe = sanitizeUrl(url);
  if (!safe) return escapeHtml(`![${alt}](${rawUrl})`);
  const style = width ? `width: ${width}px; max-width: 100%;` : "max-width: 100%;";
  return `<img src="${safe}" alt="${escapeHtml(alt)}" style="${style}">`;
}

export function renderMarkdown(text: string): string {
  if (!text) return "";
  let html = escapeHtml(text);

  // Images: ![alt](url) or ![alt](url?w=300)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => renderImage(alt, url));

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safe = sanitizeUrl(url);
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
