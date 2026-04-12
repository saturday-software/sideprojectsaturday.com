import { describe, expect, test } from 'vitest';
import { dateKeyToSlug, slugToDateKey } from '@/lib/dates';

describe('dateKeyToSlug', () => {
  test('converts YYYY-MM-DD to YYMMDD', () => {
    expect(dateKeyToSlug('2026-04-11')).toBe('260411');
  });
});

describe('slugToDateKey', () => {
  test('converts YYMMDD to YYYY-MM-DD', () => {
    expect(slugToDateKey('260411')).toBe('2026-04-11');
  });
});
