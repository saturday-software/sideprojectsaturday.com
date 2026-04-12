import { formatEventDate, dateKeyToSlug } from "@/lib/dates";
import { generateShareCode } from "@/lib/share";
import { getCalendarLink } from "./calendar";
import type { PublicSubmission, Submission } from "@/do/EventDO";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
${content}
</body>
</html>`;
}

export function verificationEmail(siteUrl: string, token: string): { subject: string; html: string } {
  return {
    subject: "Confirm your subscription to Side Project Saturday",
    html: layout(`
      <h2>Welcome!</h2>
      <p>Click the link below to confirm your subscription:</p>
      <p><a href="${siteUrl}/verify?token=${token}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Confirm Email</a></p>
      <p style="color: #666; font-size: 14px;">If you didn't sign up, you can ignore this email.</p>
    `),
  };
}

export async function wednesdayAnnouncement(
  dateKey: string,
  address: string,
  siteUrl: string,
  lastWeekSubmissions: PublicSubmission[],
  lastWeekDate: string,
  shareSeed: string
): Promise<{ subject: string; html: string }> {
  const eventDate = formatEventDate(dateKey);
  const calLink = getCalendarLink(dateKey, address);
  const shareCode = await generateShareCode(shareSeed, dateKey);

  let recapSection = "";
  if (lastWeekSubmissions.length > 0) {
    const items = lastWeekSubmissions
      .map((s) => `<li><strong>${s.participant_name}</strong>${s.description ? ` — ${s.description}` : ""}</li>`)
      .join("\n");
    recapSection = `
      <h3>Last Week's Projects</h3>
      <ul>${items}</ul>
      <p><a href="${siteUrl}/events/${dateKeyToSlug(lastWeekDate)}">View full recap →</a></p>
    `;
  }

  return {
    subject: `Side Project Saturday — ${eventDate}`,
    html: layout(`
      <h2>Side Project Saturday</h2>
      <p><strong>${eventDate}</strong></p>
      <p>📍 ${address}</p>
      <p><a href="${calLink}">Add to Google Calendar</a></p>
      <p>Come work on your side projects and share what you've been building!</p>
      <p><a href="${siteUrl}/share/${shareCode}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Submit a project</a></p>
      ${recapSection}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;"><a href="${siteUrl}/unsubscribe?email=%%EMAIL%%">Unsubscribe</a></p>
    `),
  };
}

export function wednesdayCancellation(
  dateKey: string,
  siteUrl: string
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);
  return {
    subject: `Side Project Saturday — ${eventDate} (Cancelled)`,
    html: layout(`
      <h2>Side Project Saturday</h2>
      <p><strong>${eventDate}</strong> has been <strong>cancelled</strong>.</p>
      <p>We'll be back next week!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;"><a href="${siteUrl}/unsubscribe?email=%%EMAIL%%">Unsubscribe</a></p>
    `),
  };
}

export async function fridayReminder(
  dateKey: string,
  address: string,
  siteUrl: string,
  shareSeed: string
): Promise<{ subject: string; html: string }> {
  const eventDate = formatEventDate(dateKey);
  const calLink = getCalendarLink(dateKey, address);
  const shareCode = await generateShareCode(shareSeed, dateKey);

  return {
    subject: `Reminder: Side Project Saturday is tomorrow!`,
    html: layout(`
      <h2>See you tomorrow!</h2>
      <p><strong>${eventDate}</strong></p>
      <p>📍 ${address}</p>
      <p><a href="${calLink}">Add to Google Calendar</a></p>
      <p><a href="${siteUrl}/share/${shareCode}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Submit a project</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;"><a href="${siteUrl}/unsubscribe?email=%%EMAIL%%">Unsubscribe</a></p>
    `),
  };
}

export function sundayRecap(
  dateKey: string,
  submissions: Submission[],
  imageKey: string | null,
  siteUrl: string
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);

  let imageSection = "";
  if (imageKey) {
    imageSection = `<img src="${siteUrl}/api/image/${imageKey}" alt="Event photo" style="max-width: 100%; border-radius: 8px; margin-bottom: 16px;">`;
  }

  const items = submissions
    .map(
      (s) => `
      <div style="margin-bottom: 20px; padding: 16px; background: #f9f9f9; border-radius: 8px;">
        <h3 style="margin: 0 0 8px 0;">${s.participant_name}</h3>
        <p style="margin: 0 0 4px 0;">${s.description}</p>
        ${s.contact_info ? `<p style="margin: 0 0 4px 0; color: #666;">Contact: ${s.contact_info}</p>` : ""}
        ${s.private_details ? `<p style="margin: 0; color: #666; font-style: italic;">${s.private_details}</p>` : ""}
      </div>
    `
    )
    .join("\n");

  return {
    subject: `Side Project Saturday Recap — ${eventDate}`,
    html: layout(`
      <h2>This Week's Recap</h2>
      <p><strong>${eventDate}</strong></p>
      ${imageSection}
      ${submissions.length > 0 ? items : "<p>No projects were submitted this week.</p>"}
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;"><a href="${siteUrl}/unsubscribe?email=%%EMAIL%%">Unsubscribe</a></p>
    `),
  };
}
