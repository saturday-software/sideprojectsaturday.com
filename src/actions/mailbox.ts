import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { env } from "cloudflare:workers";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/email/send";
import { renderMarkdown } from "@/lib/render-markdown";
import type { MailboxDO } from "@/do/MailboxDO";

function getMailbox(address: string) {
  const id = env.MAILBOX_DO.idFromName(address);
  return env.MAILBOX_DO.get(id) as DurableObjectStub<MailboxDO>;
}

export const mailbox = {
  reply: defineAction({
    accept: "form",
    input: z.object({
      to: z.email(),
      subject: z.string(),
      markdown: z.string(),
      address: z.string(),
      inReplyTo: z.string().optional(),
    }),
    handler: async ({ to, subject, markdown, address, inReplyTo: _inReplyTo }, context) => {
      requireAdmin(context.cookies);

      const html = renderMarkdown(markdown);
      const text = markdown.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<!\w)_(.+?)_(?!\w)/g, "$1");
      const from = `${address}@sideprojectsaturday.com`;
      await sendEmail(env.EMAIL, { to, subject, html, text, from }, env.MAILBOX_DO);

      return { message: "Reply sent" };
    },
  }),

  markRead: defineAction({
    accept: "form",
    input: z.object({
      address: z.string(),
      id: z.coerce.number().int(),
    }),
    handler: async ({ address, id }, context) => {
      requireAdmin(context.cookies);
      const mb = getMailbox(address);
      await mb.markRead(id);
      return { message: "Marked as read" };
    },
  }),
};
