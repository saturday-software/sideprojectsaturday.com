import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { requireAdmin } from "@/lib/auth";
import { isEventCancelled, setEventCancelled } from "@/lib/events";
import { addRule, deleteRule, toggleRule, toggleEventOnly } from "@/lib/door";
import { switchbotPress } from "@/lib/switchbot";
import { deleteSubscriber, markAsParticipant } from "@/lib/subscribers";
import type { EventDO } from "@/do/EventDO";

function getEventStub(slug: string) {
  const id = env.EVENT_DO.idFromName(slug);
  return env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;
}

const submissionFields = {
  participant_name: z.string().min(1, "Name is required"),
  email: z.email("Valid email is required"),
  description: z.string().optional(),
  contact_info: z.string().optional(),
  private_details: z.string().optional(),
};

export const admin = {
  login: defineAction({
    accept: "form",
    input: z.object({
      password: z.string(),
    }),
    handler: async ({ password }, context) => {
      if (password !== env.ADMIN_PASSWORD) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "Invalid password" });
      }

      context.cookies.set("sps_admin", "authenticated", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 86400,
      });

      return { message: "Logged in" };
    },
  }),

  cancel: defineAction({
    accept: "form",
    input: z.object({
      date: z.string(),
    }),
    handler: async ({ date }, context) => {
      requireAdmin(context.cookies);

      const cancelled = await isEventCancelled(env.DB, date);
      await setEventCancelled(env.DB, date, !cancelled);

      return { message: `Event ${cancelled ? "uncancelled" : "cancelled"}` };
    },
  }),

  addDoorRule: defineAction({
    accept: "form",
    input: z.object({
      day: z.coerce.number().int().min(0).max(6),
      start_hour: z.coerce.number().int().min(0).max(23),
      start_minute: z.coerce.number().int().min(0).max(59),
      end_hour: z.coerce.number().int().min(0).max(23),
      end_minute: z.coerce.number().int().min(0).max(59),
      event_only: z.coerce.boolean().optional().default(false),
    }),
    handler: async ({ day, start_hour, start_minute, end_hour, end_minute, event_only }, context) => {
      requireAdmin(context.cookies);

      const startTotal = start_hour * 60 + start_minute;
      const endTotal = end_hour * 60 + end_minute;
      if (endTotal <= startTotal) {
        throw new ActionError({ code: "BAD_REQUEST", message: "End time must be after start time" });
      }

      await addRule(env.DB, day, start_hour, start_minute, end_hour, end_minute, event_only);
      return { message: "Door rule added" };
    },
  }),

  deleteDoorRule: defineAction({
    accept: "form",
    input: z.object({
      id: z.coerce.number().int(),
    }),
    handler: async ({ id }, context) => {
      requireAdmin(context.cookies);
      await deleteRule(env.DB, id);
      return { message: "Door rule deleted" };
    },
  }),

  toggleDoorRule: defineAction({
    accept: "form",
    input: z.object({
      id: z.coerce.number().int(),
    }),
    handler: async ({ id }, context) => {
      requireAdmin(context.cookies);
      await toggleRule(env.DB, id);
      return { message: "Door rule toggled" };
    },
  }),

  toggleDoorRuleEventOnly: defineAction({
    accept: "form",
    input: z.object({
      id: z.coerce.number().int(),
    }),
    handler: async ({ id }, context) => {
      requireAdmin(context.cookies);
      await toggleEventOnly(env.DB, id);
      return { message: "Door rule updated" };
    },
  }),

  deleteSubscriber: defineAction({
    accept: "form",
    input: z.object({
      id: z.coerce.number().int(),
    }),
    handler: async ({ id }, context) => {
      requireAdmin(context.cookies);
      const deleted = await deleteSubscriber(env.DB, id);
      if (!deleted) {
        throw new ActionError({ code: "NOT_FOUND", message: "Subscriber not found" });
      }
      return { message: "Subscriber deleted" };
    },
  }),

  openDoor: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      requireAdmin(context.cookies);
      await switchbotPress(env.SWITCHBOT_DEVICE_ID, env.SWITCHBOT_TOKEN, env.SWITCHBOT_KEY);
      return { message: "Door opened!" };
    },
  }),

  addSubmission: defineAction({
    accept: "form",
    input: z.object({
      slug: z.string().regex(/^\d{6}$/, "Invalid event slug"),
      ...submissionFields,
    }),
    handler: async (input, context) => {
      requireAdmin(context.cookies);
      const stub = getEventStub(input.slug);
      const email = input.email.trim().toLowerCase();
      await stub.submitProject({
        participant_name: input.participant_name,
        email,
        description: input.description,
        contact_info: input.contact_info,
        private_details: input.private_details,
      });
      await markAsParticipant(env.DB, email);
      return { message: "Submission added" };
    },
  }),

  updateSubmission: defineAction({
    accept: "form",
    input: z.object({
      slug: z.string().regex(/^\d{6}$/, "Invalid event slug"),
      id: z.coerce.number().int(),
      ...submissionFields,
    }),
    handler: async (input, context) => {
      requireAdmin(context.cookies);
      const stub = getEventStub(input.slug);
      const updated = await stub.updateSubmission(input.id, {
        participant_name: input.participant_name,
        email: input.email.trim().toLowerCase(),
        description: input.description,
        contact_info: input.contact_info,
        private_details: input.private_details,
      });
      if (!updated) {
        throw new ActionError({ code: "NOT_FOUND", message: "Submission not found" });
      }
      return { message: "Submission updated" };
    },
  }),

  deleteSubmission: defineAction({
    accept: "form",
    input: z.object({
      slug: z.string().regex(/^\d{6}$/, "Invalid event slug"),
      id: z.coerce.number().int(),
    }),
    handler: async (input, context) => {
      requireAdmin(context.cookies);
      const stub = getEventStub(input.slug);
      const deleted = await stub.deleteSubmission(input.id);
      if (!deleted) {
        throw new ActionError({ code: "NOT_FOUND", message: "Submission not found" });
      }
      return { message: "Submission deleted" };
    },
  }),
};
