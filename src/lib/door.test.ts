import { describe, expect, test, vi } from "vitest";
import { dayName, formatTime, matchRules, isDoorOpen, type DoorRule } from "@/lib/door";

vi.mock("@/lib/events", () => ({
  isEventCancelled: vi.fn(),
}));

import { isEventCancelled } from "@/lib/events";
const mockIsEventCancelled = vi.mocked(isEventCancelled);

function makeRule(overrides: Partial<DoorRule> = {}): DoorRule {
  return {
    id: 1,
    day: 6, // Saturday
    start_hour: 9,
    start_minute: 0,
    end_hour: 12,
    end_minute: 0,
    enabled: 1,
    event_only: 0,
    ...overrides,
  };
}

function mockDb(rules: DoorRule[]) {
  return {
    prepare: () => ({
      all: async () => ({ results: rules }),
      bind: () => ({
        all: async () => ({ results: rules }),
      }),
    }),
  } as unknown as D1Database;
}

// Saturday = 6, minutes helper
const SAT = 6;
const FRI = 5;
const mins = (h: number, m: number = 0) => h * 60 + m;

describe("dayName", () => {
  test("maps day numbers to names", () => {
    expect(dayName(0)).toBe("Sun");
    expect(dayName(3)).toBe("Wed");
    expect(dayName(6)).toBe("Sat");
  });

  test("returns string for out-of-range day", () => {
    expect(dayName(7)).toBe("7");
  });
});

describe("formatTime", () => {
  test("formats AM times", () => {
    expect(formatTime(9, 0)).toBe("9:00 AM");
    expect(formatTime(9, 30)).toBe("9:30 AM");
  });

  test("formats PM times", () => {
    expect(formatTime(12, 0)).toBe("12:00 PM");
    expect(formatTime(14, 15)).toBe("2:15 PM");
  });

  test("formats midnight", () => {
    expect(formatTime(0, 0)).toBe("12:00 AM");
  });
});

describe("matchRules", () => {
  test("returns empty array when no rules exist", () => {
    expect(matchRules([], SAT, mins(10))).toEqual([]);
  });

  test("matches rule within time window", () => {
    const rule = makeRule();
    expect(matchRules([rule], SAT, mins(10))).toEqual([rule]);
  });

  test("matches at exactly the start time", () => {
    const rule = makeRule();
    expect(matchRules([rule], SAT, mins(9, 0))).toEqual([rule]);
  });

  test("does not match at exactly the end time", () => {
    const rule = makeRule();
    expect(matchRules([rule], SAT, mins(12, 0))).toEqual([]);
  });

  test("does not match wrong day", () => {
    const rule = makeRule({ day: SAT });
    expect(matchRules([rule], FRI, mins(10))).toEqual([]);
  });

  test("does not match before the window", () => {
    const rule = makeRule();
    expect(matchRules([rule], SAT, mins(8, 59))).toEqual([]);
  });

  test("does not match after the window", () => {
    const rule = makeRule();
    expect(matchRules([rule], SAT, mins(12, 1))).toEqual([]);
  });

  test("handles minute-level boundaries", () => {
    const rule = makeRule({ start_hour: 9, start_minute: 30, end_hour: 11, end_minute: 45 });
    expect(matchRules([rule], SAT, mins(9, 29))).toEqual([]);
    expect(matchRules([rule], SAT, mins(9, 30))).toEqual([rule]);
    expect(matchRules([rule], SAT, mins(11, 44))).toEqual([rule]);
    expect(matchRules([rule], SAT, mins(11, 45))).toEqual([]);
  });

  test("returns all matching rules from multiple", () => {
    const r1 = makeRule({ id: 1, start_hour: 9, end_hour: 12 });
    const r2 = makeRule({ id: 2, start_hour: 10, end_hour: 11 });
    const r3 = makeRule({ id: 3, start_hour: 14, end_hour: 17 });
    expect(matchRules([r1, r2, r3], SAT, mins(10, 30))).toEqual([r1, r2]);
  });

  test("matches different days independently", () => {
    const satRule = makeRule({ id: 1, day: SAT });
    const friRule = makeRule({ id: 2, day: FRI });
    expect(matchRules([satRule, friRule], SAT, mins(10))).toEqual([satRule]);
    expect(matchRules([satRule, friRule], FRI, mins(10))).toEqual([friRule]);
  });
});

describe("isDoorOpen", () => {
  test("returns false when no rules exist", async () => {
    const db = mockDb([]);
    expect(await isDoorOpen(db)).toBe(false);
  });

  describe("event_only rules", () => {
    // Use a fixed Saturday 10am ET as "now" for these tests.
    // April 11, 2026 is a Saturday. 10am ET = 14:00 UTC.
    const saturdayMorning = new Date("2026-04-11T14:00:00Z");

    test("returns true when event_only and event is active", async () => {
      const db = mockDb([makeRule({ event_only: 1 })]);
      mockIsEventCancelled.mockResolvedValue(false);
      expect(await isDoorOpen(db, saturdayMorning)).toBe(true);
    });

    test("returns false when event_only and event is cancelled", async () => {
      const db = mockDb([makeRule({ event_only: 1 })]);
      mockIsEventCancelled.mockResolvedValue(true);
      expect(await isDoorOpen(db, saturdayMorning)).toBe(false);
    });

    test("returns true when mixed rules and event is cancelled (non-event_only still matches)", async () => {
      const db = mockDb([
        makeRule({ id: 1, event_only: 1 }),
        makeRule({ id: 2, event_only: 0 }),
      ]);
      mockIsEventCancelled.mockResolvedValue(true);
      expect(await isDoorOpen(db, saturdayMorning)).toBe(true);
    });

    test("does not check cancellation when no event_only rules match", async () => {
      const db = mockDb([makeRule({ event_only: 0 })]);
      mockIsEventCancelled.mockClear();
      await isDoorOpen(db, saturdayMorning);
      expect(mockIsEventCancelled).not.toHaveBeenCalled();
    });
  });
});
