import { describe, expect, test } from "vitest";
import { getIcsUrl, getGoogleCalendarUrl } from "@/lib/calendar";

describe("getIcsUrl", () => {
  test("builds the hosted .ics path from site URL and date", () => {
    expect(getIcsUrl("https://sideprojectsaturday.com", "2026-04-25")).toBe(
      "https://sideprojectsaturday.com/api/calendar/2026-04-25.ics",
    );
  });
});

describe("getGoogleCalendarUrl", () => {
  const url = getGoogleCalendarUrl("2026-04-25", "325 Gold St, #503");

  test("targets Google Calendar render endpoint", () => {
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
  });

  test("sets action=TEMPLATE", () => {
    expect(url).toContain("action=TEMPLATE");
  });

  test("formats dates as YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ with a literal slash", () => {
    expect(url).toContain("dates=20260425T130000Z/20260425T160000Z");
    expect(url).not.toContain("%2F");
  });

  test("url-encodes the address for the location param", () => {
    expect(url).toContain("location=325+Gold+St%2C+%23503");
  });
});
