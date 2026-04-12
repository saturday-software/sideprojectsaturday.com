import { defineAction, ActionError } from "astro:actions";
import { env } from "cloudflare:workers";
import { isDoorOpen } from "@/lib/door";

export const space = {
  buzz: defineAction({
    accept: "json",
    handler: async () => {
      if (!(await isDoorOpen(env.DB))) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "The door is not available right now.",
        });
      }

      const result = await switchbotCommand(
        env.SWITCHBOT_DEVICE_ID,
        { command: "press", commandType: "command", parameter: "default" },
      );

      if (result.statusCode !== 100) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to open door. Please try again.",
        });
      }

      return { message: "Door opened successfully! Come on up to the 5th floor." };
    },
  }),
};

async function switchbotCommand(deviceId: string, body: Record<string, string>) {
  const token = env.SWITCHBOT_TOKEN;
  const secret = env.SWITCHBOT_KEY;
  const t = String(Date.now());
  const nonce = String(Math.floor(Math.random() * 1_000_000));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(token + t + nonce));
  const sign = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const res = await fetch(`https://api.switch-bot.com/v1.1/devices/${deviceId}/commands`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      sign,
      nonce,
      t,
    },
    body: JSON.stringify(body),
  });

  return res.json() as Promise<{ statusCode: number }>;
}
