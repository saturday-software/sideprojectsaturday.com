import { DurableObject } from "cloudflare:workers";

export interface InboxMessage {
  id: number;
  message_id: string | null;
  from_address: string;
  to_address: string;
  subject: string;
  body_html: string;
  body_text: string;
  in_reply_to: string | null;
  is_read: number;
  created_at: string;
}

export interface InboxListItem {
  id: number;
  from_address: string;
  to_address: string;
  subject: string;
  is_read: number;
  created_at: string;
}

export interface OutboxMessage {
  id: number;
  message_id: string | null;
  from_address: string;
  to_address: string;
  subject: string;
  body_html: string;
  error: string | null;
  created_at: string;
}

export interface OutboxListItem {
  id: number;
  from_address: string;
  to_address: string;
  subject: string;
  error: string | null;
  created_at: string;
}

export class MailboxDO extends DurableObject<Env> {
  private initialized = false;

  private ensureSchema() {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS inbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        body_text TEXT NOT NULL DEFAULT '',
        in_reply_to TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.initialized = true;
  }

  async storeInbound(parsed: {
    messageId?: string;
    from: string;
    to: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    inReplyTo?: string;
  }): Promise<void> {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `INSERT INTO inbox (message_id, from_address, to_address, subject, body_html, body_text, in_reply_to)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      parsed.messageId ?? null,
      parsed.from,
      parsed.to,
      parsed.subject,
      parsed.bodyHtml,
      parsed.bodyText,
      parsed.inReplyTo ?? null,
    );
  }

  async storeOutbound(msg: {
    messageId?: string;
    from: string;
    to: string;
    subject: string;
    html: string;
    error?: string;
  }): Promise<void> {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `INSERT INTO outbox (message_id, from_address, to_address, subject, body_html, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
      msg.messageId ?? null,
      msg.from,
      msg.to,
      msg.subject,
      msg.html,
      msg.error ?? null,
    );
  }

  async getInbox(
    page: number = 1,
  ): Promise<{ messages: InboxListItem[]; total: number }> {
    this.ensureSchema();
    const perPage = 25;
    const offset = (page - 1) * perPage;

    const total = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) as count FROM inbox`)
      .toArray()[0] as unknown as { count: number };

    const messages = this.ctx.storage.sql
      .exec(
        `SELECT id, from_address, to_address, subject, is_read, created_at
         FROM inbox ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        perPage,
        offset,
      )
      .toArray() as unknown as InboxListItem[];

    return { messages, total: total.count };
  }

  async getOutbox(
    page: number = 1,
  ): Promise<{ messages: OutboxListItem[]; total: number }> {
    this.ensureSchema();
    const perPage = 25;
    const offset = (page - 1) * perPage;

    const total = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) as count FROM outbox`)
      .toArray()[0] as unknown as { count: number };

    const messages = this.ctx.storage.sql
      .exec(
        `SELECT id, from_address, to_address, subject, error, created_at
         FROM outbox ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        perPage,
        offset,
      )
      .toArray() as unknown as OutboxListItem[];

    return { messages, total: total.count };
  }

  async getInboxMessage(id: number): Promise<InboxMessage | null> {
    this.ensureSchema();
    const rows = this.ctx.storage.sql
      .exec(`SELECT * FROM inbox WHERE id = ?`, id)
      .toArray() as unknown as InboxMessage[];
    return rows[0] ?? null;
  }

  async getOutboxMessage(id: number): Promise<OutboxMessage | null> {
    this.ensureSchema();
    const rows = this.ctx.storage.sql
      .exec(`SELECT * FROM outbox WHERE id = ?`, id)
      .toArray() as unknown as OutboxMessage[];
    return rows[0] ?? null;
  }

  async markRead(id: number): Promise<void> {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `UPDATE inbox SET is_read = 1 WHERE id = ?`,
      id,
    );
  }

  async getUnreadCount(): Promise<number> {
    this.ensureSchema();
    const row = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) as count FROM inbox WHERE is_read = 0`)
      .toArray()[0] as unknown as { count: number };
    return row.count;
  }
}
