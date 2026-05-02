import { EventDO } from "./do/EventDO";
import { MailboxDO } from "./do/MailboxDO";
export { EventDO, MailboxDO };

import astroHandler from "@astrojs/cloudflare/entrypoints/server";
import PostalMime from "postal-mime";

import { sendEmail } from "./email/send";
import {
  wednesdayAnnouncement,
  wednesdayCancellation,
  fridayReminder,
  sundayRecap,
} from "./email/templates";
import { getCurrentSaturday, getPreviousSaturday, dateKeyToSlug } from "./lib/dates";
import { ensureEvent, isEventCancelled, eventImageKey } from "./lib/events";
import { getVerifiedSubscribers, getParticipants, cleanupExpiredPending, invalidateSubscriberCount } from "./lib/subscribers";

async function sendInBccBatches(
  env: Env,
  recipients: { email: string }[],
  template: { subject: string; html: string },
  batchSize = 49,
): Promise<void> {
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const domain = env.FROM_EMAIL.split("@")[1];
    await sendEmail(env.EMAIL, {
      to: `noreply@${domain}`,
      bcc: batch.map((r) => r.email),
      replyTo: env.FROM_EMAIL,
      subject: template.subject,
      html: template.html,
      from: env.FROM_EMAIL,
      headers: {
        "List-Id": `Side Project Saturday <list.${domain}>`,
        "List-Unsubscribe": `<${env.SITE_URL}/unsubscribe>`,
        "Precedence": "bulk",
      },
    }, env.MAILBOX_DO);
  }
}

function getEventDO(env: Env, slug: string) {
  const id = env.EVENT_DO.idFromName(slug);
  return env.EVENT_DO.get(id) as DurableObjectStub<EventDO>;
}

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

        const lastWeekKey = getPreviousSaturday(saturdayKey);
        const lastWeekSlug = dateKeyToSlug(lastWeekKey);
        const lastWeekStub = getEventDO(env, lastWeekSlug);
        const lastWeekSubmissions = await lastWeekStub.getPublicSubmissions();

        const subscribers = await getVerifiedSubscribers(env.DB, env.CACHE);

        const template = cancelled
          ? wednesdayCancellation(saturdayKey, env.SITE_URL)
          : wednesdayAnnouncement(
              saturdayKey,
              env.EVENT_ADDRESS,
              env.SITE_URL,
              lastWeekSubmissions,
              lastWeekKey,
            );

        await sendInBccBatches(env, subscribers, template);
      } else if (cron === "0 13 * * FRI") {
        // Friday: reminder (if not cancelled)
        await ensureEvent(env.DB, saturdayKey);
        const cancelled = await isEventCancelled(env.DB, saturdayKey);
        if (cancelled) {
          console.log(`[scheduled] ok cron="${cron}" reason=cancelled`);
          return;
        }

        const subscribers = await getVerifiedSubscribers(env.DB, env.CACHE);
        const template = fridayReminder(saturdayKey, env.EVENT_ADDRESS, env.SITE_URL);

        await sendInBccBatches(env, subscribers, template);
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

        const participants = await getParticipants(env.DB, env.CACHE);
        const template = sundayRecap(recapKey, submissions, hasImage ? imageKey : null, env.SITE_URL);

        await sendInBccBatches(env, participants, template);
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
