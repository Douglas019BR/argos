import { DateTime } from 'luxon';

const INVESTING_FORMAT = 'yyyy-MM-dd HH:mm:ss';
const INVESTING_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Parses a feed date into a UTC `Date`, or returns `null` when it cannot be read.
 *
 * Handles RFC-822 (InfoMoney) and the timezone-less `yyyy-MM-dd HH:mm:ss` shape
 * used by Investing.com, which is assumed to be UTC.
 */
export function parseDate(input: string | undefined): Date | null {
  if (input === undefined || input.trim() === '') {
    return null;
  }

  const value = input.trim();

  if (INVESTING_PATTERN.test(value)) {
    const parsed = DateTime.fromFormat(value, INVESTING_FORMAT, { zone: 'utc' });
    return parsed.isValid ? parsed.toJSDate() : null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
