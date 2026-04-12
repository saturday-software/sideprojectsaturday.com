import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { dateKeyToSlug } from "@/lib/dates";
import { eventImageKey } from "@/lib/events";
import { requireAdmin } from "@/lib/auth";
import { markAsParticipant } from "@/lib/subscribers";
import type { EventDO } from "@/do/EventDO";

export const events = {
  submit: defineAction({
    accept: "form",
    input: z.object({
      date: z.string(),
      share_code: z.string().optional(),
      description: z.string().optional(),
      participant_name: z.string().min(1, "Name is required"),
      email: z.email("Valid email is required"),
      contact_info: z.string().optional(),
      private_details: z.string().optional(),
    }),
    handler: async (input) => {
      const slug = dateKeyToSlug(input.date);
      const id = env.EVENT_DO.idFromName(slug);
      const stub = env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;

      await stub.submitProject({
        participant_name: input.participant_name,
        email: input.email.trim().toLowerCase(),
        description: input.description,
        contact_info: input.contact_info,
        private_details: input.private_details,
      });

      await markAsParticipant(env.DB, input.email.trim().toLowerCase());

      return { slug, shareCode: input.share_code };
    },
  }),

  uploadImage: defineAction({
    accept: "form",
    input: z.object({
      slug: z.string(),
      image: z.instanceof(File),
    }),
    handler: async ({ slug, image }, context) => {
      requireAdmin(context.cookies);

      if (image.size === 0) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Missing image" });
      }

      const key = eventImageKey(slug);

      await env.IMAGES_BUCKET.put(key, image.stream(), {
        httpMetadata: { contentType: image.type },
      });

      return { message: "Image uploaded" };
    },
  }),
};
