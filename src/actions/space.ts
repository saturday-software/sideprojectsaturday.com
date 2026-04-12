import { defineAction, ActionError } from "astro:actions";
import { env } from "cloudflare:workers";
import { isDoorOpen } from "@/lib/door";
import { switchbotPress } from "@/lib/switchbot";

export const space = {
  buzz: defineAction({
    accept: "form",
    handler: async (_input, _context) => {
      if (!(await isDoorOpen(env.DB))) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "The door is not available right now.",
        });
      }

      try {
        await switchbotPress(env.SWITCHBOT_DEVICE_ID, env.SWITCHBOT_TOKEN, env.SWITCHBOT_KEY);
      } catch {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to open door. Please try again.",
        });
      }

      return { message: "Door opened successfully! Come on up to the 5th floor." };
    },
  }),
};
