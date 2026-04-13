import { EventDO } from "./do/EventDO";
export { EventDO };

import astroHandler from "@astrojs/cloudflare/entrypoints/server";

import { sendEmail } from "./email/send";
import {
  wednesdayAnnouncement,
  wednesdayCancellation,
  fridayReminder,
  sundayRecap,
} from "./email/templates";
import { getCurrentSaturday, getPreviousSaturday, dateKeyToSlug } from "./lib/dates";
import { ensureEvent, isEventCancelled, eventImageKey } from "./lib/events";
import { getVerifiedSubscribers, getParticipants, cleanupExpiredPending } from "./lib/subscribers";

function getEventDO(env: Env, slug: string) {
  const id = env.EVENT_DO.idFromName(slug);
  return env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return astroHandler.fetch(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const cron = controller.cron;
    const now = new Date();
    const saturdayKey = getCurrentSaturday(now);

    // Clean up unverified subscribers on every cron run
    await cleanupExpiredPending(env.DB);

    if (cron === "0 13 * * 3") {
      // Wednesday: announcement or cancellation
      await ensureEvent(env.DB, saturdayKey);
      const cancelled = await isEventCancelled(env.DB, saturdayKey);

      const lastWeekKey = getPreviousSaturday(saturdayKey);
      const lastWeekSlug = dateKeyToSlug(lastWeekKey);
      const lastWeekStub = getEventDO(env, lastWeekSlug);
      const lastWeekSubmissions = await lastWeekStub.getPublicSubmissions();

      const subscribers = await getVerifiedSubscribers(env.DB);

      const template = cancelled
        ? wednesdayCancellation(saturdayKey, env.SITE_URL)
        : wednesdayAnnouncement(
            saturdayKey,
            env.EVENT_ADDRESS,
            env.SITE_URL,
            lastWeekSubmissions,
            lastWeekKey,
          );

      for (const sub of subscribers) {
        const html = template.html.replace("%%EMAIL%%", encodeURIComponent(sub.email));
        await sendEmail(env.EMAIL, {
          to: sub.email,
          subject: template.subject,
          html,
          from: env.FROM_EMAIL,
        });
      }
    } else if (cron === "0 13 * * 5") {
      // Friday: reminder (if not cancelled)
      await ensureEvent(env.DB, saturdayKey);
      const cancelled = await isEventCancelled(env.DB, saturdayKey);
      if (cancelled) return;

      const subscribers = await getVerifiedSubscribers(env.DB);
      const template = fridayReminder(saturdayKey, env.EVENT_ADDRESS, env.SITE_URL);

      for (const sub of subscribers) {
        const html = template.html.replace("%%EMAIL%%", encodeURIComponent(sub.email));
        await sendEmail(env.EMAIL, {
          to: sub.email,
          subject: template.subject,
          html,
          from: env.FROM_EMAIL,
        });
      }
    } else if (cron === "0 16 * * SUN") {
      // Sunday: recap to participants only
      // On Sunday, yesterday was Saturday
      const recapKey = (() => {
        const day = now.getUTCDay();
        if (day === 0) {
          const sat = new Date(now);
          sat.setUTCDate(sat.getUTCDate() - 1);
          return sat.toISOString().slice(0, 10);
        }
        return saturdayKey;
      })();
      const recapSlug = dateKeyToSlug(recapKey);

      const stub = getEventDO(env, recapSlug);
      const submissions = await stub.getSubmissions();
      const imageKey = eventImageKey(recapSlug);
      const hasImage = await env.IMAGES_BUCKET.head(imageKey) !== null;

      const participants = await getParticipants(env.DB);
      const template = sundayRecap(recapKey, submissions, hasImage ? imageKey : null, env.SITE_URL);

      for (const sub of participants) {
        const html = template.html.replace("%%EMAIL%%", encodeURIComponent(sub.email));
        await sendEmail(env.EMAIL, {
          to: sub.email,
          subject: template.subject,
          html,
          from: env.FROM_EMAIL,
        });
      }
    }
  },
};
