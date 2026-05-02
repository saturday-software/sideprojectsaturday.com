import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { addSubscriber, invalidateSubscriberCount } from "@/lib/subscribers";
import { sendEmail } from "@/email/send";
import { verificationEmail } from "@/email/templates";

const FROM = "hello@sideprojectsaturday.com";

export const subscribe = defineAction({
  accept: "form",
  input: z.object({
    email: z.email("Please enter a valid email address"),
  }),
  handler: async ({ email }) => {
    const normalized = email.trim().toLowerCase();
    const result = await addSubscriber(env.DB, normalized);

    if (result.status === "sent") {
      // New row or refreshed pending row may have changed total count.
      await invalidateSubscriberCount(env.CACHE);
    }

    if (result.status === "verified") {
      return {
        kind: "already_subscribed" as const,
        message: `You're already subscribed! You'll receive emails from ${FROM}.`,
      };
    }

    if (result.status === "rate_limited") {
      return {
        kind: "sent" as const,
        message: `We already sent you a verification email. Check your inbox for an email from ${FROM}.`,
      };
    }

    const template = verificationEmail(env.SITE_URL, result.token);
    await sendEmail(env.EMAIL, {
      to: normalized,
      subject: template.subject,
      html: template.html,
      from: env.FROM_EMAIL,
    });

    return {
      kind: "sent" as const,
      message: `Check your inbox for an email from ${FROM} to confirm your subscription.`,
    };
  },
});
