import { render } from "@react-email/components";
import { VerificationEmail } from "./components/VerificationEmail";
import { WednesdayAnnouncement } from "./components/WednesdayAnnouncement";
import { WednesdayCancellation } from "./components/WednesdayCancellation";
import { FridayReminder } from "./components/FridayReminder";
import { SundayRecap } from "./components/SundayRecap";
import { formatEventDate, dateKeyToSlug } from "@/lib/dates";
import { generateShareCode } from "@/lib/share";
import { getCalendarLink } from "./calendar";
import type { PublicSubmission, Submission } from "@/do/EventDO";

export function verificationEmail(
  siteUrl: string,
  token: string
): { subject: string; html: string } {
  return {
    subject: "Confirm your subscription to Side Project Saturday",
    html: render(<VerificationEmail siteUrl={siteUrl} token={token} />),
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
  const calendarLink = getCalendarLink(dateKey, address);
  const shareCode = await generateShareCode(shareSeed, dateKey);

  return {
    subject: `Side Project Saturday — ${eventDate}`,
    html: render(
      <WednesdayAnnouncement
        siteUrl={siteUrl}
        eventDate={eventDate}
        address={address}
        calendarLink={calendarLink}
        submitLink={`${siteUrl}/share/${shareCode}`}
        lastWeekProjects={lastWeekSubmissions}
        lastWeekRecapLink={
          lastWeekSubmissions.length > 0
            ? `${siteUrl}/events/${dateKeyToSlug(lastWeekDate)}`
            : undefined
        }
      />
    ),
  };
}

export function wednesdayCancellation(
  dateKey: string,
  siteUrl: string
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);
  return {
    subject: `Side Project Saturday — ${eventDate} (Cancelled)`,
    html: render(
      <WednesdayCancellation siteUrl={siteUrl} eventDate={eventDate} />
    ),
  };
}

export async function fridayReminder(
  dateKey: string,
  address: string,
  siteUrl: string,
  shareSeed: string
): Promise<{ subject: string; html: string }> {
  const eventDate = formatEventDate(dateKey);
  const calendarLink = getCalendarLink(dateKey, address);
  const shareCode = await generateShareCode(shareSeed, dateKey);

  return {
    subject: "Reminder: Side Project Saturday is tomorrow!",
    html: render(
      <FridayReminder
        siteUrl={siteUrl}
        eventDate={eventDate}
        address={address}
        calendarLink={calendarLink}
        submitLink={`${siteUrl}/share/${shareCode}`}
      />
    ),
  };
}

export function sundayRecap(
  dateKey: string,
  submissions: Submission[],
  imageKey: string | null,
  siteUrl: string
): { subject: string; html: string } {
  const eventDate = formatEventDate(dateKey);
  return {
    subject: `Side Project Saturday Recap — ${eventDate}`,
    html: render(
      <SundayRecap
        siteUrl={siteUrl}
        eventDate={eventDate}
        imageUrl={imageKey ? `${siteUrl}/api/image/${imageKey}` : undefined}
        submissions={submissions}
      />
    ),
  };
}
