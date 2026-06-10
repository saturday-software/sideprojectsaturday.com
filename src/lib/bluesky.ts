import type { PublicSubmission } from "@/do/EventDO";
import { dateKeyToSlug, formatEventDate } from "@/lib/dates";

const BSKY_API = "https://bsky.social/xrpc";
const MAX_GRAPHEMES = 300;

interface BskySession {
  did: string;
  accessJwt: string;
}

interface RichtextFacet {
  index: { byteStart: number; byteEnd: number };
  features: [{ $type: "app.bsky.richtext.facet#link"; uri: string }];
}

function graphemeLength(text: string): number {
  return [...new Intl.Segmenter().segment(text)].length;
}

function truncate(text: string, maxGraphemes: number): string {
  const segs = [...new Intl.Segmenter().segment(text)];
  if (segs.length <= maxGraphemes) return text;
  const ellipsis = "…";
  return segs.slice(0, maxGraphemes - 1).map((s) => s.segment).join("") + ellipsis;
}

function buildFacets(text: string, links: { display: string; uri: string }[]): RichtextFacet[] {
  const encoder = new TextEncoder();
  const facets: RichtextFacet[] = [];
  for (const link of links) {
    const idx = text.indexOf(link.display);
    if (idx === -1) continue;
    const byteStart = encoder.encode(text.slice(0, idx)).length;
    const byteEnd = byteStart + encoder.encode(link.display).length;
    facets.push({ index: { byteStart, byteEnd }, features: [{ $type: "app.bsky.richtext.facet#link", uri: link.uri }] });
  }
  return facets;
}

async function createSession(identifier: string, password: string): Promise<BskySession> {
  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bluesky auth failed ${res.status}: ${body}`);
  }
  return res.json() as Promise<BskySession>;
}

async function createRecord(
  session: BskySession,
  text: string,
  facets: RichtextFacet[],
): Promise<void> {
  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };
  if (facets.length > 0) record.facets = facets;

  const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bluesky post failed ${res.status}: ${body}`);
  }
}

async function post(identifier: string, appPassword: string, text: string, links: { display: string; uri: string }[] = []): Promise<void> {
  const session = await createSession(identifier, appPassword);
  const facets = buildFacets(text, links);
  await createRecord(session, text, facets);
}

export async function postAnnouncement(
  identifier: string,
  appPassword: string,
  dateKey: string,
  address: string,
  siteUrl: string,
  lastWeekSubmissions: PublicSubmission[],
  lastWeekKey: string,
): Promise<void> {
  const eventDate = formatEventDate(dateKey);
  const siteDisplay = siteUrl.replace(/^https?:\/\//, "");

  let text = `Side Project Saturday — ${eventDate}\n\n${address}\n\nCome work on your side projects and share what you've been building!\n\n${siteDisplay}`;

  if (lastWeekSubmissions.length > 0) {
    const names = lastWeekSubmissions.map((s) => s.participant_name).join(", ");
    const recapUrl = `${siteUrl}/events/${dateKeyToSlug(lastWeekKey)}`;
    const recapDisplay = `${siteDisplay}/events/${dateKeyToSlug(lastWeekKey)}`;
    const withRecap = `Side Project Saturday — ${eventDate}\n\n${address}\n\nLast week: ${names}\n${recapDisplay}\n\n${siteDisplay}`;
    text = graphemeLength(withRecap) <= MAX_GRAPHEMES ? withRecap : text;
  }

  const links = [{ display: siteUrl.replace(/^https?:\/\//, ""), uri: siteUrl }];
  await post(identifier, appPassword, truncate(text, MAX_GRAPHEMES), links);
}

export async function postCancellation(
  identifier: string,
  appPassword: string,
  dateKey: string,
): Promise<void> {
  const eventDate = formatEventDate(dateKey);
  const text = `Side Project Saturday is cancelled this week (${eventDate}).\n\nWe'll be back next week!`;
  await post(identifier, appPassword, text);
}

export async function postRecap(
  identifier: string,
  appPassword: string,
  dateKey: string,
  submissions: { participant_name: string; description: string }[],
  siteUrl: string,
): Promise<void> {
  const eventDate = formatEventDate(dateKey);
  const slug = dateKeyToSlug(dateKey);
  const eventUrl = `${siteUrl}/events/${slug}`;
  const eventDisplay = `${siteUrl.replace(/^https?:\/\//, "")}/events/${slug}`;

  const names = submissions.map((s) => s.participant_name).join(", ");
  const header = `Side Project Saturday recap — ${eventDate}`;

  let body = submissions.length === 0
    ? `${header}\n\n${eventDisplay}`
    : `${header}\n\n${names}\n\n${eventDisplay}`;

  body = truncate(body, MAX_GRAPHEMES);
  const links = [{ display: eventDisplay, uri: eventUrl }];
  await post(identifier, appPassword, body, links);
}
