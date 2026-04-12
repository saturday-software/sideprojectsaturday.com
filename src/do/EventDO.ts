import { DurableObject } from "cloudflare:workers";

export interface Submission {
  id: number;
  participant_name: string;
  description: string;
  email: string;
  contact_info: string;
  private_details: string;
  submitted_at: string;
}

export interface PublicSubmission {
  participant_name: string;
  description: string;
}

export class EventDO extends DurableObject<Env> {
  private initialized = false;

  private ensureSchema() {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL DEFAULT '',
        participant_name TEXT NOT NULL,
        email TEXT NOT NULL,
        contact_info TEXT NOT NULL DEFAULT '',
        private_details TEXT NOT NULL DEFAULT '',
        submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.initialized = true;
  }

  async submitProject(data: {
    participant_name: string;
    email: string;
    description?: string;
    contact_info?: string;
    private_details?: string;
  }): Promise<number> {
    this.ensureSchema();
    const cursor = this.ctx.storage.sql.exec(
      `INSERT INTO submissions (description, participant_name, email, contact_info, private_details)
       VALUES (?, ?, ?, ?, ?)`,
      data.description ?? "",
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
        `SELECT participant_name, description FROM submissions ORDER BY submitted_at ASC`
      )
      .toArray() as unknown as PublicSubmission[];
  }
}
