import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export const POST: APIRoute = async ({ request }) => {

  const contentType = request.headers.get("content-type") || "";
  if (!ALLOWED_TYPES[contentType]) {
    return new Response(
      JSON.stringify({ error: "Unsupported content type. Allowed: jpeg, png, webp, gif" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_SIZE) {
    return new Response(
      JSON.stringify({ error: "File too large. Maximum 5MB." }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  const ext = ALLOWED_TYPES[contentType];
  const key = `submissions/${crypto.randomUUID()}.${ext}`;

  const source = request.headers.get("x-upload-source") || "unknown";

  await env.IMAGES_BUCKET.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata: { source },
  });

  return new Response(
    JSON.stringify({ imageUrl: `/api/image/${key}` }),
    { headers: { "Content-Type": "application/json" } }
  );
};
