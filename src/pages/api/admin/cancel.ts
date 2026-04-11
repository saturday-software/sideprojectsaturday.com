import type { APIRoute } from "astro";
import { isAdmin } from "../../../lib/auth";
import type { EventDO } from "../../../do/EventDO";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  if (!isAdmin(request, env.ADMIN_PASSWORD)) {
    return redirect("/admin");
  }

  const formData = await request.formData();
  const date = formData.get("date")?.toString();
  if (!date) return redirect("/admin");

  const id = env.EVENT_DO.idFromName(date);
  const stub = env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;
  await stub.init(date);

  const cancelled = await stub.isCancelled();
  if (cancelled) {
    await stub.uncancel();
  } else {
    await stub.cancel();
  }

  return redirect(`/admin?message=Event ${cancelled ? "uncancelled" : "cancelled"}`);
};
