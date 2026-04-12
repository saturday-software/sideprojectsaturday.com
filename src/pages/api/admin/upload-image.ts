import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isAdmin } from "@/lib/auth";
import { dateKeyToSlug } from "@/lib/dates";
import type { EventDO } from "@/do/EventDO";

export const POST: APIRoute = async ({ request, redirect }) => {
  if (!isAdmin(request)) {
    return redirect("/admin");
  }

  const formData = await request.formData();
  const date = formData.get("date")?.toString();
  const image = formData.get("image") as File | null;

  if (!date || !image || image.size === 0) {
    return redirect("/admin?error=Missing image or date");
  }

  const slug = dateKeyToSlug(date);
  const ext = image.name.split(".").pop() || "jpg";
  const key = `${slug}/event-image.${ext}`;

  await env.IMAGES_BUCKET.put(key, image.stream(), {
    httpMetadata: { contentType: image.type },
  });

  const id = env.EVENT_DO.idFromName(slug);
  const stub = env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;
  await stub.init(slug);
  await stub.setImageKey(key);

  return redirect("/admin?message=Image uploaded");
};
