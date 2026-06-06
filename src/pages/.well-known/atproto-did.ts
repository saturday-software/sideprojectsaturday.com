import type { APIRoute } from "astro";

// Bluesky domain handle verification (@sideprojectsaturday.com)
export const GET: APIRoute = () =>
  new Response("did:plc:5d64cskfkhaba3zlar73k7i5", {
    headers: { "content-type": "text/plain" },
  });
