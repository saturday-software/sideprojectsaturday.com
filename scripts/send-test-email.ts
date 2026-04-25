#!/usr/bin/env bun
import { parseArgs } from "util";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { select, text, intro, outro, isCancel, cancel } from "@clack/prompts";
import {
  verificationEmail,
  wednesdayAnnouncement,
  wednesdayCancellation,
  fridayReminder,
  sundayRecap,
} from "@/email/templates";
import { getCurrentSaturday, dateKeyToSlug } from "@/lib/dates";
import { eventImageKey } from "@/lib/events";

const TEMPLATES = [
  "verification",
  "wednesday-announcement",
  "wednesday-cancellation",
  "friday-reminder",
  "sunday-recap",
] as const;

type Template = (typeof TEMPLATES)[number];

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    to: { type: "string" },
    date: { type: "string" },
  },
  allowPositionals: true,
});

intro("Send test email");

let template: Template;
if (positionals[0] && TEMPLATES.includes(positionals[0] as Template)) {
  template = positionals[0] as Template;
} else {
  const result = await select({
    message: "Pick a template",
    options: TEMPLATES.map((t) => ({ value: t, label: t })),
  });
  if (isCancel(result)) {
    cancel("Cancelled");
    process.exit(0);
  }
  template = result;
}

let to: string;
if (values.to) {
  to = values.to;
} else {
  const result = await text({
    message: "Recipient email address",
    validate: (v) => (v?.includes("@") ? undefined : "Must be a valid email"),
  });
  if (isCancel(result)) {
    cancel("Cancelled");
    process.exit(0);
  }
  to = result;
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
        { id: 1, participant_name: "Alice", description: "Built a weather CLI in Rust" },
        { id: 2, participant_name: "Bob", description: "Designed a logo for my podcast" },
      ], dateKey);

    case "wednesday-cancellation":
      return wednesdayCancellation(dateKey, siteUrl);

    case "friday-reminder":
      return fridayReminder(dateKey, address, siteUrl);

    case "sunday-recap":
      return sundayRecap(dateKey, [
        { id: 1, email: "alice@example.com", participant_name: "Alice", description: "Built a weather CLI in Rust", contact_info: "@alice", private_details: "", submitted_at: new Date().toISOString() },
        { id: 2, email: "bob@example.com", participant_name: "Bob", description: "Designed a logo for my podcast", contact_info: "", private_details: "Looking for a co-founder", submitted_at: new Date().toISOString() },
        { id: 3, email: "charlie@example.com", participant_name: "Charlie", description: "Shipped v1 of my budgeting app", contact_info: "charlie@example.com", private_details: "", submitted_at: new Date().toISOString() },
        { id: 4, email: "dana@example.com", participant_name: "Dana", description: "", contact_info: "", private_details: "", submitted_at: new Date().toISOString() },
      ], eventImageKey(dateKeyToSlug(dateKey)), siteUrl);
  }
}

const { subject, html } = await generate();
const rendered = html.replace("%%EMAIL%%", encodeURIComponent(to));

const __dirname = dirname(fileURLToPath(import.meta.url));
const wrangler = resolve(__dirname, "../node_modules/.bin/wrangler");
const configFile = resolve(__dirname, "../wrangler.jsonc");

console.log(`\nSending "${subject}" to ${to}...`);

const proc = spawn(wrangler, [
  "email", "sending", "send",
  "--config", configFile,
  "--from", from,
  "--from-name", "Side Project Saturday",
  "--to", to,
  "--subject", subject,
  "--html", rendered,
], { stdio: "inherit" });

const exitCode = await new Promise<number>((res) =>
  proc.on("close", (code) => res(code ?? 1)),
);

if (exitCode === 0) {
  outro("Email sent!");
} else {
  process.exit(exitCode);
}
