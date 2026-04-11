import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const key = params.key;

  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.IMAGES_BUCKET.get(key);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=31536000",
    },
  });
};
