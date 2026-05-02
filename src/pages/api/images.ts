import type { APIRoute } from "astro";
import { isAdmin } from "@/lib/auth";
import { parseEventImageKey, recordEventImageDelete } from "@/lib/events";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const objects: { key: string; size: number; uploaded: string; source: string }[] = [];
  let cursor: string | undefined;

  do {
    const list = await env.IMAGES_BUCKET.list({ cursor, limit: 500, include: ["customMetadata"] });
    for (const obj of list.objects) {
      objects.push({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
        source: obj.customMetadata?.source || "unknown",
      });
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  return new Response(JSON.stringify(objects), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { key } = (await request.json()) as { key: unknown };
  if (!key || typeof key !== "string") {
    return new Response(JSON.stringify({ error: "Missing key" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await env.IMAGES_BUCKET.delete(key);

  const eventSlug = parseEventImageKey(key);
  if (eventSlug) {
    await recordEventImageDelete(env.CACHE, env.IMAGES_BUCKET, eventSlug);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
