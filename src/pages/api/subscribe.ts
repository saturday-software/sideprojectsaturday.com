import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { addSubscriber } from "../../lib/subscribers";
import { sendEmail } from "../../email/send";
import { verificationEmail } from "../../email/templates";

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString()?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return redirect("/?error=Please enter a valid email address");
  }

  try {
    const { token, existing } = await addSubscriber(env.DB, email);

    if (existing) {
      return redirect("/?message=You're already subscribed!");
    }

    const template = verificationEmail(env.SITE_URL, token);
    await sendEmail(env.EMAIL, {
      to: email,
      subject: template.subject,
      html: template.html,
      from: env.FROM_EMAIL,
    });

    return redirect("/?message=Check your email to confirm your subscription!");
  } catch (e) {
    console.error("Subscribe error:", e);
    return redirect("/?error=Something went wrong. Please try again.");
  }
};
