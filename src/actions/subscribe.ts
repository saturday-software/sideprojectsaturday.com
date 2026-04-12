import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { addSubscriber } from "@/lib/subscribers";
import { sendEmail } from "@/email/send";
import { verificationEmail } from "@/email/templates";

export const subscribe = defineAction({
  accept: "form",
  input: z.object({
    email: z.email("Please enter a valid email address"),
  }),
  handler: async ({ email }) => {
    const normalized = email.trim().toLowerCase();
    const { token, existing } = await addSubscriber(env.DB, normalized);

    if (existing) {
      return { message: "You're already subscribed!" };
    }

    const template = verificationEmail(env.SITE_URL, token);
    await sendEmail(env.EMAIL, {
      to: normalized,
      subject: template.subject,
      html: template.html,
      from: env.FROM_EMAIL,
    });

    return { message: "Check your email to confirm your subscription!" };
  },
});
