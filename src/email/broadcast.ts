import { sendInBatches } from "./batch-send";
import {
  getVerifiedSubscribers,
  invalidateSubscriberCount,
  invalidateVerifiedList,
  invalidateParticipantsList,
  recordEmailStrike,
  clearEmailStrikes,
} from "@/lib/subscribers";

interface Template {
  subject: string;
  html: string;
  text: string;
}

/**
 * Send a template to every verified subscriber. Recipients that fail
 * individually get a strike (three strikes disables them); a success clears
 * their strikes. Returns how many subscribers it was sent to.
 */
export async function broadcastToSubscribers(env: Env, template: Template): Promise<number> {
  const subscribers = await getVerifiedSubscribers(env.DB, env.CACHE);

  let disabledAny = false;
  await sendInBatches({
    env,
    recipients: subscribers,
    template,
    onRecipientFailure: async (email) => {
      const disabled = await recordEmailStrike(env.DB, email);
      if (disabled) {
        disabledAny = true;
        console.log(`[broadcast] disabled subscriber email="${email}" reason=3-strikes`);
      }
    },
    onRecipientSuccess: async (email) => {
      await clearEmailStrikes(env.DB, email);
    },
  });

  if (disabledAny) {
    await invalidateVerifiedList(env.CACHE);
    await invalidateParticipantsList(env.CACHE);
    await invalidateSubscriberCount(env.CACHE);
  }

  return subscribers.length;
}
