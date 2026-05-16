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

const DEFAULT_BATCH_SIZE = 20;

export type RecipientMode = "bcc" | "cc";

export interface SendInBatchesArgs {
  env: BatchEnv;
  recipients: { email: string }[];
  template: Template;
  batchSize?: number;
  mode?: RecipientMode;
  send?: SendFn;
  /** Called once per recipient that ultimately failed to deliver (only fired during the individual-send fallback). */
  onRecipientFailure?: (email: string) => Promise<void> | void;
  /** Called once per recipient whose individual send succeeded (only fired during the individual-send fallback). */
  onRecipientSuccess?: (email: string) => Promise<void> | void;
}

export async function sendInBatches(args: SendInBatchesArgs): Promise<void> {
  const {
    env,
    recipients,
    template,
    batchSize = DEFAULT_BATCH_SIZE,
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

  const sendIndividually = async (emails: string[]): Promise<void> => {
    for (const only of emails) {
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
    }
  };

  const trySend = async (emails: string[]): Promise<void> => {
    if (emails.length === 0) return;
    if (emails.length === 1) {
      await sendIndividually(emails);
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
        `[sendInBatches] batch failed size=${emails.length} err="${msg}" emails=${JSON.stringify(emails)}; retrying individually`,
      );
      await sendIndividually(emails);
    }
  };

  for (let i = 0; i < recipients.length; i += batchSize) {
    const emails = recipients.slice(i, i + batchSize).map((r) => r.email);
    await trySend(emails);
  }
}
