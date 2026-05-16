import type { MailboxDO } from "@/do/MailboxDO";
import { sendEmail as defaultSendEmail } from "./send";

interface BatchEnv {
  EMAIL: SendEmail;
  MAILBOX_DO: DurableObjectNamespace<MailboxDO>;
  FROM_EMAIL: string;
  SITE_URL: string;
}

interface Template {
  subject: string;
  html: string;
  text: string;
}

type SendFn = typeof defaultSendEmail;

export type RecipientMode = "bcc" | "cc";

export interface SendInBatchesArgs {
  env: BatchEnv;
  recipients: { email: string }[];
  template: Template;
  batchSize?: number;
  mode?: RecipientMode;
  send?: SendFn;
  /** Called once per recipient that ultimately failed to deliver (after halving down to size 1). */
  onRecipientFailure?: (email: string) => Promise<void> | void;
  /** Called once per recipient whose individual send succeeded (only invoked when we had to fall back to size 1). */
  onRecipientSuccess?: (email: string) => Promise<void> | void;
}

export async function sendInBatches(args: SendInBatchesArgs): Promise<void> {
  const {
    env,
    recipients,
    template,
    batchSize = 49,
    mode = "bcc",
    send = defaultSendEmail,
    onRecipientFailure,
    onRecipientSuccess,
  } = args;

  const domain = env.FROM_EMAIL.split("@")[1];
  const headers = {
    "List-Id": `Side Project Saturday <list.${domain}>`,
    "List-Unsubscribe": `<${env.SITE_URL}/unsubscribe>`,
    "Precedence": "bulk",
  };

  const trySend = async (emails: string[]): Promise<void> => {
    if (emails.length === 0) return;

    if (emails.length === 1) {
      const [only] = emails;
      try {
        await send(env.EMAIL, {
          to: only,
          replyTo: env.FROM_EMAIL,
          subject: template.subject,
          html: template.html,
          text: template.text,
          from: env.FROM_EMAIL,
          headers,
        }, env.MAILBOX_DO);
        if (onRecipientSuccess) await onRecipientSuccess(only);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[sendInBatches] recipient failed email="${only}" err="${msg}"`);
        if (onRecipientFailure) await onRecipientFailure(only);
      }
      return;
    }

    try {
      await send(env.EMAIL, {
        to: `noreply@${domain}`,
        ...(mode === "bcc" ? { bcc: emails } : { cc: emails }),
        replyTo: env.FROM_EMAIL,
        subject: template.subject,
        html: template.html,
        text: template.text,
        from: env.FROM_EMAIL,
        headers,
      }, env.MAILBOX_DO);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[sendInBatches] batch failed size=${emails.length} err="${msg}" emails=${JSON.stringify(emails)}; splitting`,
      );
      const mid = Math.ceil(emails.length / 2);
      await trySend(emails.slice(0, mid));
      await trySend(emails.slice(mid));
    }
  };

  for (let i = 0; i < recipients.length; i += batchSize) {
    const emails = recipients.slice(i, i + batchSize).map((r) => r.email);
    await trySend(emails);
  }
}
