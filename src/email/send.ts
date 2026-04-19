import type { MailboxDO } from "@/do/MailboxDO";

interface SendEmailOptions {
  to: string;
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  from: string;
  headers?: Record<string, string>;
}

export async function sendEmail(
  emailBinding: SendEmail,
  options: SendEmailOptions,
  mailboxBinding?: DurableObjectNamespace<MailboxDO>,
): Promise<void> {
  let error: string | undefined;
  try {
    await emailBinding.send({
      from: options.from,
      to: options.to,
      ...(options.bcc && options.bcc.length > 0 ? { bcc: options.bcc } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
      subject: options.subject,
      html: options.html,
      ...(options.text ? { text: options.text } : {}),
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (!mailboxBinding) throw e;
  }

  if (mailboxBinding) {
    const localPart = options.from.split("@")[0];
    const id = mailboxBinding.idFromName(localPart);
    const mailbox = mailboxBinding.get(id) as DurableObjectStub<MailboxDO>;
    await mailbox.storeOutbound({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      error,
    });
    if (error) throw new Error(error);
  }
}
