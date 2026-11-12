import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { requireAdmin } from "@/lib/auth";
import { isEventCancelled, setEventCancelled } from "@/lib/events";
import { addRule, deleteRule, toggleRule, toggleEventOnly } from "@/lib/door";
import { switchbotPress } from "@/lib/switchbot";
import { renderMarkdown, markdownToText } from "@/lib/render-markdown";
import { broadcastEmail } from "@/email/templates";
import { broadcastToSubscribers } from "@/email/broadcast";
import { sendEmail } from "@/email/send";
import {
  deleteSubscriber,
  invalidateSubscriberCount,
  invalidateVerifiedList,
  invalidateParticipantsList,
} from "@/lib/subscribers";

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
      await invalidateSubscriberCount(env.CACHE);
      await invalidateVerifiedList(env.CACHE);
      await invalidateParticipantsList(env.CACHE);
      return { message: "Subscriber deleted" };
    },
  }),

  sendBroadcast: defineAction({
    accept: "form",
    input: z.object({
      subject: z.string().trim().min(1, "Subject is required"),
      markdown: z.string().trim().min(1, "Body is required"),
      // "test" sends a single copy to testEmail; "all" sends to every verified subscriber
      mode: z.enum(["test", "all"]),
      testEmail: z.string().trim().optional(),
      confirm: z.string().optional(),
    }),
    handler: async ({ subject, markdown, mode, testEmail, confirm }, context) => {
      requireAdmin(context.cookies);

      const template = broadcastEmail(
        subject,
        renderMarkdown(markdown, { baseUrl: env.SITE_URL }),
        markdownToText(markdown, { baseUrl: env.SITE_URL }),
        env.SITE_URL,
      );

      if (mode === "test") {
        const to = z.email().safeParse(testEmail);
        if (!to.success) {
          throw new ActionError({ code: "BAD_REQUEST", message: "Enter a valid address for the test send" });
        }
        await sendEmail(env.EMAIL, {
          to: to.data,
          from: env.FROM_EMAIL,
          replyTo: env.FROM_EMAIL,
          subject: `[TEST] ${template.subject}`,
          html: template.html,
          text: template.text,
        }, env.MAILBOX_DO);
        return { message: `Test sent to ${to.data}`, mode };
      }

      if (confirm !== "SEND") {
        throw new ActionError({ code: "BAD_REQUEST", message: 'Type SEND to confirm sending to everyone' });
      }
      const count = await broadcastToSubscribers(env, template);
      return { message: `Sent to ${count} subscriber${count === 1 ? "" : "s"}`, mode };
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
};
