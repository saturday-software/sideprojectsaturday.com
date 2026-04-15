import { EmailMessage } from "cloudflare:email";
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

function buildRawEmail(options: SendEmailOptions): string {
  const boundary = `----=_Part_${Date.now()}`;
  const parts: string[] = [
    `From: Side Project Saturday <${options.from}>`,
    `To: ${options.to}`,
    ...(options.bcc && options.bcc.length > 0 ? [`BCC: ${options.bcc.join(", ")}`] : []),
    ...(options.replyTo ? [`Reply-To: ${options.replyTo}`] : []),
    ...Object.entries(options.headers ?? {}).map(([k, v]) => `${k}: ${v}`),
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
  ];

  if (options.text) {
    parts.push(
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
      ``,
      options.text,
      ``,
    );
  }

  parts.push(
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    options.html,
    ``,
    `--${boundary}--`,
  );

  return parts.join("\r\n");
}

export async function sendEmail(
  emailBinding: SendEmail,
  options: SendEmailOptions,
  mailboxBinding?: DurableObjectNamespace<MailboxDO>,
): Promise<void> {
  const raw = buildRawEmail(options);
  const message = new EmailMessage(options.from, options.to, raw);

  let error: string | undefined;
  try {
    await emailBinding.send(message);
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
