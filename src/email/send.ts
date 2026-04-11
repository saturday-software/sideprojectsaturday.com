import { createMimeMessage } from "mimetext/browser";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from: string;
}

export async function sendEmail(
  emailBinding: SendEmail,
  options: SendEmailOptions
): Promise<void> {
  const msg = createMimeMessage();
  msg.setSender({ addr: options.from, name: "Side Project Saturday" });
  msg.setRecipient(options.to);
  msg.setSubject(options.subject);
  msg.addMessage({
    contentType: "text/html",
    data: options.html,
  });

  const message = new EmailMessage(options.from, options.to, msg.asRaw());
  await emailBinding.send(message);
}
