import { formatEventDate, dateKeyToSlug } from "@/lib/dates";
import { getGoogleCalendarUrl, getIcsUrl } from "@/lib/calendar";
import type { PublicSubmission, Submission } from "@/do/EventDO";

function calendarLinksHtml(siteUrl: string, dateKey: string, address: string): string {
  const ics = getIcsUrl(siteUrl, dateKey);
  const google = getGoogleCalendarUrl(dateKey, address);
  return `<p>Add to calendar: <a href="${google}" style="color: #000000;">Google Cal</a> | <a href="${ics}" style="color: #000000;">ics</a></p>`;
}

function calendarLinksText(siteUrl: string, dateKey: string, address: string): string {
  const ics = getIcsUrl(siteUrl, dateKey);
  const google = getGoogleCalendarUrl(dateKey, address);
  return `Add to calendar:\n  .ics:            ${ics}\n  Google Calendar: ${google}`;
}

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

function textFooter(siteUrl: string): string {
  return `\n--\nUnsubscribe: ${siteUrl}/unsubscribe`;
}

export function unsubscribeConfirmationEmail(
  siteUrl: string,
  email: string,
  token: string,
): { subject: string; html: string; text: string } {
  const url = `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  return {
    subject: "Confirm your unsubscribe request",
    html: layout(`
      <h2>Unsubscribe</h2>
      <p>Click the link below to unsubscribe from Side Project Saturday emails:</p>
      <p><a href="${url}" style="display: inline-block; background-color: #ffffff; color: #000000; padding: 8px 20px; text-decoration: none; border: 2px solid #000000; border-radius: 1px; font-family: 'Courier New', Courier, monospace;">Confirm Unsubscribe</a></p>
      <p style="color: #666;">If you didn't request this, you can ignore this email.</p>
    `),
    text: `Unsubscribe from Side Project Saturday

Click the link below to confirm your unsubscribe request:
${url}

If you didn't request this, you can ignore this email.`,
  };
}

export function verificationEmail(
  siteUrl: string,
  token: string,
): { subject: string; html: string; text: string } {
  const url = `${siteUrl}/verify?token=${token}`;
  return {
    subject: "Confirm your subscription to Side Project Saturday",
    html: layout(`
      <h2>Welcome!</h2>
      <p>Click the link below to confirm your subscription:</p>
      <p><a href="${url}" style="display: inline-block; background-color: #ffffff; color: #000000; padding: 8px 20px; text-decoration: none; border: 2px solid #000000; border-radius: 1px; font-family: 'Courier New', Courier, monospace;">Confirm Email</a></p>
      <p style="color: #666;">If you didn't sign up, you can ignore this email.</p>
      ${footer(siteUrl)}
    `),
    text: `Welcome to Side Project Saturday!

Click the link below to confirm your subscription:
${url}

If you didn't sign up, you can ignore this email.${textFooter(siteUrl)}`,
  };
}

export function wednesdayAnnouncement(
  dateKey: string,
  address: string,
  siteUrl: string,
  lastWeekSubmissions: PublicSubmission[],
  lastWeekDate: string,
): { subject: string; html: string; text: string } {
  const eventDate = formatEventDate(dateKey);

  let recapSection = "";
  let recapText = "";
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
    const textItems = lastWeekSubmissions
      .map((s) => `- ${s.participant_name}${s.description ? `: ${s.description}` : ""}`)
      .join("\n");
    recapText = `\nLast Week's Projects:\n${textItems}\nFull recap: ${siteUrl}/events/${dateKeyToSlug(lastWeekDate)}\n`;
  }

  return {
    subject: "Side Project Saturday this week",
    html: layout(`
      <h2>Side Project Saturday</h2>
      <p><strong>${eventDate}</strong></p>
      <p>${address}</p>
      ${calendarLinksHtml(siteUrl, dateKey, address)}
      <p>Come work on your side projects and share what you've been building!</p>
      ${recapSection}
      ${footer(siteUrl)}
    `),
    text: `Side Project Saturday

${eventDate}
${address}

${calendarLinksText(siteUrl, dateKey, address)}

Come work on your side projects and share what you've been building!
${recapText}${textFooter(siteUrl)}`,
  };
}

export function wednesdayCancellation(
  dateKey: string,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const eventDate = formatEventDate(dateKey);
  return {
    subject: "Side Project Saturday is cancelled this week",
    html: layout(`
      <h2>Side Project Saturday</h2>
      <p><strong>${eventDate}</strong> has been <strong>cancelled</strong>.</p>
      <p>We'll be back next week!</p>
      ${footer(siteUrl)}
    `),
    text: `Side Project Saturday

${eventDate} has been cancelled.

We'll be back next week!${textFooter(siteUrl)}`,
  };
}

export function fridayReminder(
  dateKey: string,
  address: string,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const eventDate = formatEventDate(dateKey);

  return {
    subject: "Side Project Saturday is tomorrow!",
    html: layout(`
      <h2>See you tomorrow!</h2>
      <p><strong>${eventDate}</strong></p>
      <p>${address}</p>
      ${calendarLinksHtml(siteUrl, dateKey, address)}
      <p>You can <a href="${siteUrl}/buzz" style="color: #000000;">buzz yourself into the building</a> or press the buzzer for Val.town and I'll let you in.</p>
      ${footer(siteUrl)}
    `),
    text: `Side Project Saturday is tomorrow!

${eventDate}
${address}

${calendarLinksText(siteUrl, dateKey, address)}

You can buzz yourself into the building with ${siteUrl}/buzz or press the buzzer for Val.town and I'll let you in.${textFooter(siteUrl)}`,
  };
}

export function sundayRecap(
  dateKey: string,
  submissions: Submission[],
  imageKey: string | null,
  siteUrl: string,
): { subject: string; html: string; text: string } {
  const eventDate = formatEventDate(dateKey);

  let imageSection = "";
  if (imageKey) {
    imageSection = `<img src="${siteUrl}/api/image/${imageKey}" alt="Event photo" style="max-width: 100%; margin-bottom: 16px;">`;
  }

  const projects = submissions.filter((s) => s.description.trim() !== "");

  let participantsSection = "";
  let participantsText = "";
  if (submissions.length > 0) {
    const names = submissions
      .map((s) => `<li>${s.participant_name}</li>`)
      .join("\n");
    participantsSection = `
      <h3>Participants</h3>
      <p style="color: #666; font-size: 12px; margin: 0 0 8px;">Only includes folks who chose to share they were here.</p>
      <ul>${names}</ul>
    `;
    const textNames = submissions.map((s) => `- ${s.participant_name}`).join("\n");
    participantsText = `Participants (only folks who chose to share they were here):\n${textNames}\n`;
  }

  let projectsSection = "";
  let projectsText = "";
  if (projects.length > 0) {
    const items = projects
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
    projectsSection = `<h3>Projects</h3>${items}`;

    const textItems = projects
      .map((s) => {
        let entry = `- ${s.participant_name}: ${s.description}`;
        if (s.contact_info) entry += `\n  Contact: ${s.contact_info}`;
        return entry;
      })
      .join("\n");
    projectsText = `\nProjects:\n${textItems}\n`;
  }

  const emptyHtml =
    submissions.length === 0
      ? "<p>No one shared their attendance this week.</p>"
      : "";
  const emptyText =
    submissions.length === 0 ? "No one shared their attendance this week." : "";

  return {
    subject: "Side Project Saturday recap",
    html: layout(`
      <h2>This Week's Recap</h2>
      <p><strong>${eventDate}</strong></p>
      ${imageSection}
      ${participantsSection}
      ${projectsSection}
      ${emptyHtml}
      ${footer(siteUrl)}
    `),
    text: `Side Project Saturday Recap

${eventDate}

${participantsText}${projectsText}${emptyText}${textFooter(siteUrl)}`,
  };
}
