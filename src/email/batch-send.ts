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

export async function sendInBatches(
  env: BatchEnv,
  recipients: { email: string }[],
  template: Template,
  batchSize = 49,
  send: SendFn = defaultSendEmail,
): Promise<void> {
  const domain = env.FROM_EMAIL.split("@")[1];
  const headers = {
    "List-Id": `Side Project Saturday <list.${domain}>`,
    "List-Unsubscribe": `<${env.SITE_URL}/unsubscribe>`,
    "Precedence": "bulk",
  };

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const emails = batch.map((r) => r.email);
    try {
      await send(env.EMAIL, {
        to: `noreply@${domain}`,
        bcc: emails,
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
        `[sendInBatches] batch failed offset=${i} size=${emails.length} err="${msg}" emails=${JSON.stringify(emails)}; retrying per-recipient`
      );
      for (const email of emails) {
        try {
          await send(env.EMAIL, {
            to: email,
            replyTo: env.FROM_EMAIL,
            subject: template.subject,
            html: template.html,
            text: template.text,
            from: env.FROM_EMAIL,
            headers,
          }, env.MAILBOX_DO);
        } catch (perErr) {
          const perMsg = perErr instanceof Error ? perErr.message : String(perErr);
          console.error(`[sendInBatches] recipient failed email="${email}" err="${perMsg}"`);
        }
      }
    }
  }
}
