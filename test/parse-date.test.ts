import { describe, expect, it } from 'vitest';

import { parseDate } from '../src/time/parse-date.js';

describe('parseDate', () => {
  it('parses an RFC-822 date as UTC', () => {
    const parsed = parseDate('Mon, 21 Sep 2026 13:47:42 +0000');
    expect(parsed?.toISOString()).toBe('2026-09-21T13:47:42.000Z');
  });

  it('parses the Investing.com format as UTC, not local time', () => {
    const parsed = parseDate('2026-09-21 13:16:51');
    expect(parsed?.toISOString()).toBe('2026-09-21T13:16:51.000Z');
  });

  it('parses an ISO-8601 date with offset', () => {
    const parsed = parseDate('2026-09-21T10:00:00-03:00');
    expect(parsed?.toISOString()).toBe('2026-09-21T13:00:00.000Z');
  });

  it('returns null for undefined', () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it('returns null for a blank string', () => {
    expect(parseDate('   ')).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(parseDate('not a date')).toBeNull();
  });
});
