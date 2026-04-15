import { formatEventDate, dateKeyToSlug } from "@/lib/dates";
import { getCalendarLink } from "./calendar";
import type { PublicSubmission, Submission } from "@/do/EventDO";

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; -webkit-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; border: 1px solid #000000;">
          <tr>
            <td style="padding: 32px; font-family: 'Courier New', Courier, monospace; font-size: 14px; line-height: 1.6; color: #000000;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function footer(siteUrl: string): string {
  return `<hr style="border: none; border-top: 1px solid #000000; margin: 32px 0 16px;">
<p><a href="${siteUrl}/unsubscribe" style="color: #000000;">Unsubscribe</a></p>`;
}

export function unsubscribeConfirmationEmail(
  siteUrl: string,
  email: string,
  token: string,
): { subject: string; html: string } {
  const url = `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  return {
    subject: "Confirm your unsubscribe request",
    html: layout(`
      <h2>Unsubscribe</h2>
      <p>Click the link below to unsubscribe from Side Project Saturday emails:</p>
      <p><a href="${url}" style="display: inline-block; background-color: #ffffff; color: #000000; padding: 8px 20px; text-decoration: none; border: 2px solid #000000; border-radius: 1px; font-family: 'Courier New', Courier, monospace;">Confirm Unsubscribe</a></p>
      <p style="color: #666;">If you didn't request this, you can ignore this email.</p>
    `),
  };
}

export function verificationEmail(
  siteUrl: string,
  token: string,
): { subject: string; html: string } {
  return {
    subject: "Confirm your subscription to Side Project Saturday",
    html: layout(`
      <h2>Welcome!</h2>
      <p>Click the link below to confirm your subscription:</p>
      <p><a href="${siteUrl}/verify?token=${token}" style="display: inline-block; background-color: #ffffff; color: #000000; padding: 8px 20px; text-decoration: none; border: 2px solid #000000; border-radius: 1px; font-family: 'Courier New', Courier, monospace;">Confirm Email</a></p>
      <p style="color: #666;">If you didn't sign up, you can ignore this email.</p>
      ${footer(siteUrl)}
    `),
  };
}

export function wednesdayAnnouncement(
  dateKey: string,
  address: string,
  siteUrl: string,
  lastWeekSubmissions: PublicSubmission[],
  lastWeekDate: string,
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);
  const calLink = getCalendarLink(dateKey, address);

  let recapSection = "";
  if (lastWeekSubmissions.length > 0) {
    const items = lastWeekSubmissions
      .map(
        (s) =>
          `<li><strong>${s.participant_name}</strong>${s.description ? ` — ${s.description}` : ""}</li>`,
      )
      .join("\n");
    recapSection = `
      <h3>Last Week's Projects</h3>
      <ul>${items}</ul>
      <p><a href="${siteUrl}/events/${dateKeyToSlug(lastWeekDate)}" style="color: #000000;">View full recap →</a></p>
    `;
  }

  return {
    subject: "Side Project Saturday this week",
    html: layout(`
      <h2>Side Project Saturday</h2>
      <p><strong>${eventDate}</strong></p>
      <p>${address}</p>
      <p><a href="${calLink}" style="color: #000000;">Add to Calendar</a></p>
      <p>Come work on your side projects and share what you've been building!</p>
      ${recapSection}
      ${footer(siteUrl)}
    `),
  };
}

export function wednesdayCancellation(
  dateKey: string,
  siteUrl: string,
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);
  return {
    subject: "Side Project Saturday is cancelled this week",
    html: layout(`
      <h2>Side Project Saturday</h2>
      <p><strong>${eventDate}</strong> has been <strong>cancelled</strong>.</p>
      <p>We'll be back next week!</p>
      ${footer(siteUrl)}
    `),
  };
}

export function fridayReminder(
  dateKey: string,
  address: string,
  siteUrl: string,
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);
  const calLink = getCalendarLink(dateKey, address);

  return {
    subject: "Side Project Saturday is tomorrow!",
    html: layout(`
      <h2>See you tomorrow!</h2>
      <p><strong>${eventDate}</strong></p>
      <p>${address}</p>
      <p><a href="${calLink}" style="color: #000000;">Add to Calendar</a></p>
      ${footer(siteUrl)}
    `),
  };
}

export function sundayRecap(
  dateKey: string,
  submissions: Submission[],
  imageKey: string | null,
  siteUrl: string,
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);

  let imageSection = "";
  if (imageKey) {
    imageSection = `<img src="${siteUrl}/api/image/${imageKey}" alt="Event photo" style="max-width: 100%; margin-bottom: 16px;">`;
  }

  const items = submissions
    .map(
      (s) => `
      <div style="margin-bottom: 12px; padding: 12px; border: 1px solid #000000;">
        <strong>${s.participant_name}</strong>
        <p style="margin: 4px 0;">${s.description}</p>
        ${s.contact_info ? `<p style="margin: 4px 0; color: #666;">Contact: ${s.contact_info}</p>` : ""}
        ${s.private_details ? `<p style="margin: 0; color: #666; font-style: italic;">${s.private_details}</p>` : ""}
      </div>
    `,
    )
    .join("\n");

  return {
    subject: "Side Project Saturday recap",
    html: layout(`
      <h2>This Week's Recap</h2>
      <p><strong>${eventDate}</strong></p>
      ${imageSection}
      ${submissions.length > 0 ? items : "<p>No projects were submitted this week.</p>"}
      ${footer(siteUrl)}
    `),
  };
}
