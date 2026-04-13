#!/usr/bin/env bun
import { parseArgs } from "util";
import { resolve } from "path";
import {
  verificationEmail,
  wednesdayAnnouncement,
  wednesdayCancellation,
  fridayReminder,
  sundayRecap,
} from "@/email/templates";
import { getCurrentSaturday } from "@/lib/dates";

const TEMPLATES = [
  "verification",
  "wednesday-announcement",
  "wednesday-cancellation",
  "friday-reminder",
  "sunday-recap",
] as const;

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    to: { type: "string" },
    date: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`Usage: bun scripts/send-test-email.ts <template> --to <email> [--date YYYY-MM-DD]

Templates:
  ${TEMPLATES.join("\n  ")}

Options:
  --to     Recipient email address (required)
  --date   Saturday date key (default: upcoming Saturday)
  -h       Show this help`);
  process.exit(0);
}

const template = positionals[0] as (typeof TEMPLATES)[number];
if (!TEMPLATES.includes(template)) {
  console.error(`Unknown template: ${template}\nAvailable: ${TEMPLATES.join(", ")}`);
  process.exit(1);
}

if (!values.to) {
  console.error("--to is required");
  process.exit(1);
}

const dateKey = values.date ?? getCurrentSaturday();
const siteUrl = "https://sideprojectsaturday.com";
const address = "325 Gold St #503";
const from = "hello@sideprojectsaturday.com";
const shareSeed = "dev-seed-change-in-prod";

async function generate(): Promise<{ subject: string; html: string }> {
  switch (template) {
    case "verification":
      return verificationEmail(siteUrl, "test-token-abc123");

    case "wednesday-announcement":
      return wednesdayAnnouncement(dateKey, address, siteUrl, [
        { participant_name: "Alice", description: "Built a weather CLI in Rust" },
        { participant_name: "Bob", description: "Designed a logo for my podcast" },
      ], dateKey, shareSeed);

    case "wednesday-cancellation":
      return wednesdayCancellation(dateKey, siteUrl);

    case "friday-reminder":
      return fridayReminder(dateKey, address, siteUrl, shareSeed);

    case "sunday-recap":
      return sundayRecap(dateKey, [
        { participant_name: "Alice", description: "Built a weather CLI in Rust", contact_info: "@alice", private_details: "" },
        { participant_name: "Bob", description: "Designed a logo for my podcast", contact_info: "", private_details: "Looking for a co-founder" },
        { participant_name: "Charlie", description: "Shipped v1 of my budgeting app", contact_info: "charlie@example.com", private_details: "" },
      ], null, siteUrl);
  }
}

const { subject, html } = await generate();
const rendered = html.replace("%%EMAIL%%", encodeURIComponent(values.to));

const wrangler = resolve(import.meta.dir, "../node_modules/.bin/wrangler");

console.log(`Sending "${subject}" to ${values.to}...`);

const configFile = resolve(import.meta.dir, "../wrangler.jsonc");

const proc = Bun.spawn(
  [wrangler, "email", "sending", "send",
    "--config", configFile,
    "--from", from,
    "--from-name", "Side Project Saturday",
    "--to", values.to,
    "--subject", subject,
    "--html", rendered,
  ],
  { stdio: ["inherit", "inherit", "inherit"] }
);

await proc.exited;
process.exit(proc.exitCode ?? 0);
