import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { requireAdmin } from "@/lib/auth";
import { isEventCancelled, setEventCancelled } from "@/lib/events";

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
};
