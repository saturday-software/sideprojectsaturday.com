import { DurableObject } from "cloudflare:workers";

export interface Submission {
  id: number;
  project_name: string;
  description: string;
  participant_name: string;
  email: string;
  contact_info: string;
  private_details: string;
  submitted_at: string;
}

export interface PublicSubmission {
  project_name: string;
  description: string;
  participant_name: string;
}

export class EventDO extends DurableObject<Env> {
  private initialized = false;

  private ensureSchema() {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS event_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        event_date TEXT NOT NULL,
        is_cancelled INTEGER NOT NULL DEFAULT 0,
        image_key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_name TEXT NOT NULL,
        description TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        email TEXT NOT NULL,
        contact_info TEXT NOT NULL DEFAULT '',
        private_details TEXT NOT NULL DEFAULT '',
        submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.initialized = true;
  }

  async init(eventDate: string): Promise<void> {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO event_meta (id, event_date) VALUES (1, ?)`,
      eventDate
    );
  }

  async cancel(): Promise<void> {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `UPDATE event_meta SET is_cancelled = 1 WHERE id = 1`
    );
  }

  async uncancel(): Promise<void> {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `UPDATE event_meta SET is_cancelled = 0 WHERE id = 1`
    );
  }

  async isCancelled(): Promise<boolean> {
    this.ensureSchema();
    const row = this.ctx.storage.sql
      .exec(`SELECT is_cancelled FROM event_meta WHERE id = 1`)
      .toArray()[0] as { is_cancelled: number } | undefined;
    return row?.is_cancelled === 1;
  }

  async setImageKey(key: string): Promise<void> {
    this.ensureSchema();
    this.ctx.storage.sql.exec(
      `UPDATE event_meta SET image_key = ? WHERE id = 1`,
      key
    );
  }

  async getImageKey(): Promise<string | null> {
    this.ensureSchema();
    const row = this.ctx.storage.sql
      .exec(`SELECT image_key FROM event_meta WHERE id = 1`)
      .toArray()[0] as { image_key: string | null } | undefined;
    return row?.image_key ?? null;
  }

  async submitProject(data: {
    project_name: string;
    description: string;
    participant_name: string;
    email: string;
    contact_info?: string;
    private_details?: string;
  }): Promise<number> {
    this.ensureSchema();
    await this.init(data.email); // ensure meta row exists
    const cursor = this.ctx.storage.sql.exec(
      `INSERT INTO submissions (project_name, description, participant_name, email, contact_info, private_details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      data.project_name,
      data.description,
      data.participant_name,
      data.email,
      data.contact_info ?? "",
      data.private_details ?? ""
    );
    return Number(cursor.rowsWritten);
  }

  async getSubmissions(): Promise<Submission[]> {
    this.ensureSchema();
    return this.ctx.storage.sql
      .exec(`SELECT * FROM submissions ORDER BY submitted_at ASC`)
      .toArray() as unknown as Submission[];
  }

  async getPublicSubmissions(): Promise<PublicSubmission[]> {
    this.ensureSchema();
    return this.ctx.storage.sql
      .exec(
        `SELECT project_name, description, participant_name FROM submissions ORDER BY submitted_at ASC`
      )
      .toArray() as unknown as PublicSubmission[];
  }

  async isOpen(): Promise<boolean> {
    this.ensureSchema();
    const row = this.ctx.storage.sql
      .exec(`SELECT event_date FROM event_meta WHERE id = 1`)
      .toArray()[0] as { event_date: string } | undefined;
    if (!row) return false;

    // event_date is stored as YYMMDD slug
    const slug = row.event_date;
    const yy = slug.slice(0, 2);
    const mm = slug.slice(2, 4);
    const dd = slug.slice(4, 6);
    const year = parseInt(yy, 10) >= 70 ? `19${yy}` : `20${yy}`;
    const saturday = new Date(`${year}-${mm}-${dd}T00:00:00Z`);
    const deadline = new Date(saturday);
    deadline.setUTCDate(deadline.getUTCDate() + 2);
    deadline.setUTCHours(4, 0, 0, 0);
    return new Date() < deadline;
  }
}
