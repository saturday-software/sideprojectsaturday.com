import { EventDO } from "./do/EventDO";
import { MailboxDO } from "./do/MailboxDO";
export { EventDO, MailboxDO };

import astroHandler from "@astrojs/cloudflare/entrypoints/server";
import PostalMime from "postal-mime";

import { broadcastToSubscribers } from "./email/broadcast";
import {
  wednesdayAnnouncement,
  wednesdayCancellation,
  fridayReminder,
} from "./email/templates";
import { getCurrentSaturday } from "./lib/dates";
import { ensureEvent, isEventCancelled } from "./lib/events";
import { cleanupExpiredPending, invalidateSubscriberCount } from "./lib/subscribers";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return astroHandler.fetch(request, env, ctx);
  },

  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext) {
    const localPart = message.to.split("@")[0];
    const id = env.MAILBOX_DO.idFromName(localPart);
    const mailbox = env.MAILBOX_DO.get(id) as DurableObjectStub<MailboxDO>;

    const rawEmail = new Response(message.raw);
    const arrayBuffer = await rawEmail.arrayBuffer();
    const parsed = await PostalMime.parse(arrayBuffer);

    await mailbox.storeInbound({
      messageId: parsed.messageId,
      from: message.from,
      to: message.to,
      subject: parsed.subject ?? "",
      bodyHtml: parsed.html ?? "",
      bodyText: parsed.text ?? "",
      inReplyTo: parsed.inReplyTo,
    });
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const cron = controller.cron;
    const now = new Date();
    const saturdayKey = getCurrentSaturday(now);
    console.log(`[scheduled] enter cron="${cron}" saturdayKey="${saturdayKey}"`);

    try {
      // Clean up unverified subscribers on every cron run
      const removed = await cleanupExpiredPending(env.DB);
      if (removed > 0) await invalidateSubscriberCount(env.CACHE);

      if (cron === "0 13 * * WED") {
        // Wednesday: announcement or cancellation
        await ensureEvent(env.DB, saturdayKey);
        const cancelled = await isEventCancelled(env.DB, saturdayKey);

        const template = cancelled
          ? wednesdayCancellation(saturdayKey, env.SITE_URL)
          : wednesdayAnnouncement(saturdayKey, env.EVENT_ADDRESS, env.SITE_URL);

        await broadcastToSubscribers(env, template);
      } else if (cron === "0 13 * * FRI") {
        // Friday: reminder (if not cancelled)
        await ensureEvent(env.DB, saturdayKey);
        const cancelled = await isEventCancelled(env.DB, saturdayKey);
        if (cancelled) {
          console.log(`[scheduled] ok cron="${cron}" reason=cancelled`);
          return;
        }

        const template = fridayReminder(saturdayKey, env.EVENT_ADDRESS, env.SITE_URL);

        await broadcastToSubscribers(env, template);
      }
      console.log(`[scheduled] ok cron="${cron}"`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : undefined;
      console.error(`[scheduled] throw cron="${cron}" saturdayKey="${saturdayKey}" msg="${msg}"`);
      if (stack) console.error(`[scheduled] stack:\n${stack}`);
      throw e;
    }
  },
};
