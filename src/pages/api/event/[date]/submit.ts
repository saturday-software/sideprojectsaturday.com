import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import type { EventDO } from "../../../../do/EventDO";
import { markAsParticipant } from "../../../../lib/subscribers";

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { date } = params;
  if (!date) return redirect("/");
  const formData = await request.formData();

  const project_name = formData.get("project_name")?.toString()?.trim() || "";
  const description = formData.get("description")?.toString()?.trim() || "";
  const participant_name = formData.get("participant_name")?.toString()?.trim();
  const email = formData.get("email")?.toString()?.trim().toLowerCase();
  const contact_info = formData.get("contact_info")?.toString()?.trim() || "";
  const private_details =
    formData.get("private_details")?.toString()?.trim() || "";

  if (!participant_name || !email) {
    return redirect(
      `/event/${date}?error=All required fields must be filled out`,
    );
  }

  try {
    const id = env.EVENT_DO.idFromName(date);
    const stub = env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;
    await stub.init(date);

    await stub.submitProject({
      project_name,
      description,
      participant_name,
      email,
      contact_info,
      private_details,
    });

    await markAsParticipant(env.DB, email);

    return redirect(`/recap/${date}`);
  } catch (e) {
    console.error("Submit error:", e);
    return redirect(
      `/event/${date}?error=Something went wrong. Please try again.`,
    );
  }
};
