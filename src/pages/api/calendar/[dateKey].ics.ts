import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { generateIcs } from "@/lib/calendar";

export const GET: APIRoute = ({ params }) => {
  const dateKey = params.dateKey;

  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return new Response("Not found", { status: 404 });
  }

  const ics = generateIcs(dateKey, env.EVENT_ADDRESS);

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="side-project-saturday-${dateKey}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
};
