import type { MailboxDO } from "@/do/MailboxDO";
import {
  recordEmailStrike,
  clearEmailStrikes,
  invalidateVerifiedList,
  invalidateParticipantsList,
  invalidateSubscriberCount,
} from "@/lib/subscribers";
import { sendInBatches, type SendInBatchesArgs } from "./batch-send";

interface BroadcastEnv {
  EMAIL: SendEmail;
  MAILBOX_DO: DurableObjectNamespace<MailboxDO>;
  FROM_EMAIL: string;
  SITE_URL: string;
  DB: D1Database;
  CACHE: KVNamespace;
}

interface Template {
  subject: string;
  html: string;
  text: string;
}

export interface BroadcastResult {
  /** How many addresses the send was attempted for. */
  recipients: number;
  /** Addresses that hit their third strike during this send and are now disabled. */
  disabled: string[];
}

/**
 * Send one message to a list of subscribers, applying the strike system:
 * a recipient that fails an individual send earns a strike (three strikes
 * disables them), a successful one has its strikes cleared. Cached lists are
 * invalidated only when someone was actually disabled.
 *
 * Shared by the cron mailings and the manual admin broadcast so both treat
 * delivery failures the same way.
 */
export async function sendBroadcast(args: {
  env: BroadcastEnv;
  recipients: { email: string }[];
  template: Template;
  batchSize?: number;
  send?: SendInBatchesArgs["send"];
}): Promise<BroadcastResult> {
  const { env, recipients, template, batchSize, send } = args;
  const disabled: string[] = [];

  await sendInBatches({
    env,
    recipients,
    template,
    ...(batchSize ? { batchSize } : {}),
    ...(send ? { send } : {}),
    onRecipientFailure: async (email) => {
      if (await recordEmailStrike(env.DB, email)) {
        disabled.push(email);
        console.log(`[broadcast] disabled subscriber email="${email}" reason=3-strikes`);
      }
    },
    onRecipientSuccess: async (email) => {
      await clearEmailStrikes(env.DB, email);
    },
  });

  if (disabled.length > 0) {
    await invalidateVerifiedList(env.CACHE);
    await invalidateParticipantsList(env.CACHE);
    await invalidateSubscriberCount(env.CACHE);
  }

  return { recipients: recipients.length, disabled };
}
