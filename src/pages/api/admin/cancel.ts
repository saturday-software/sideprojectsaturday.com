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
  if (!date) return redirect("/admin");

  const slug = dateKeyToSlug(date);
  const id = env.EVENT_DO.idFromName(slug);
  const stub = env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;
  await stub.init(slug);

  const cancelled = await stub.isCancelled();
  if (cancelled) {
    await stub.uncancel();
  } else {
    await stub.cancel();
  }

  return redirect(`/admin?message=Event ${cancelled ? "uncancelled" : "cancelled"}`);
};
