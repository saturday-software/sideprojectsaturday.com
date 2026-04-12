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
import { getVerifiedSubscribers, getParticipants } from "./lib/subscribers";

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
    const saturdaySlug = dateKeyToSlug(saturdayKey);

    if (cron === "0 13 * * 3") {
      // Wednesday: announcement or cancellation
      const stub = getEventDO(env, saturdaySlug);
      await stub.init(saturdaySlug);
      const cancelled = await stub.isCancelled();

      const lastWeekKey = getPreviousSaturday(saturdayKey);
      const lastWeekSlug = dateKeyToSlug(lastWeekKey);
      const lastWeekStub = getEventDO(env, lastWeekSlug);
      const lastWeekSubmissions = await lastWeekStub.getPublicSubmissions();

      const subscribers = await getVerifiedSubscribers(env.DB);

      const template = cancelled
        ? wednesdayCancellation(saturdayKey, env.SITE_URL)
        : await wednesdayAnnouncement(
            saturdayKey,
            env.EVENT_ADDRESS,
            env.SITE_URL,
            lastWeekSubmissions,
            lastWeekKey,
            env.SHARE_SEED
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
      const stub = getEventDO(env, saturdaySlug);
      await stub.init(saturdaySlug);
      const cancelled = await stub.isCancelled();
      if (cancelled) return;

      const subscribers = await getVerifiedSubscribers(env.DB);
      const template = await fridayReminder(saturdayKey, env.EVENT_ADDRESS, env.SITE_URL, env.SHARE_SEED);

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
      const imageKey = await stub.getImageKey();

      const participants = await getParticipants(env.DB);
      const template = sundayRecap(recapKey, submissions, imageKey, env.SITE_URL);

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
