import { describe, expect, it } from 'vitest';
import {
  clampReportRange,
  defaultReportRange,
  MAX_REPORT_SPAN_DAYS,
  shiftDays,
  spanDays,
  todayInZone,
} from './report-dates';

const TODAY = '2026-11-02';

describe('the two dates a report is asked for', () => {
  it('opens on the seven days it always opened on', () => {
    // The server's `last_7_days` is today and the six before it; the figures must not move.
    expect(defaultReportRange(TODAY)).toEqual({ fromISO: '2026-10-27', toISO: TODAY });
    expect(spanDays('2026-10-27', TODAY)).toBe(7);
  });

  it('reads today where the business is, not where the reader is', () => {
    // 19:30 in Kolkata on the 2nd is still the 1st in Los Angeles; an owner there reads their own day.
    expect(todayInZone('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInZone('not/a-zone')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayInZone(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts a span the way the server counts it — both ends in', () => {
    expect(spanDays(TODAY, TODAY)).toBe(1);
    expect(spanDays('2026-10-31', '2026-11-02')).toBe(3);
    // A month boundary and a leap day, since these are calendar dates, not 86,400-second blocks.
    expect(spanDays('2024-02-28', '2024-03-01')).toBe(3);
  });
});

describe('what the fields will not let an owner ask for', () => {
  it('refuses a date after today at either end', () => {
    expect(clampReportRange('2027-01-01', '2027-02-01', TODAY, 'from')).toEqual({ fromISO: TODAY, toISO: TODAY });
    expect(clampReportRange('2026-10-01', '2027-02-01', TODAY, 'to').toISO).toBe(TODAY);
  });

  it('drags the other end along when one crosses it, rather than refusing the tap', () => {
    // Moved From past To: To follows.
    expect(clampReportRange('2026-10-20', '2026-10-10', TODAY, 'from')).toEqual({
      fromISO: '2026-10-20',
      toISO: '2026-10-20',
    });
    // Moved To before From: From follows.
    expect(clampReportRange('2026-10-20', '2026-10-10', TODAY, 'to')).toEqual({
      fromISO: '2026-10-10',
      toISO: '2026-10-10',
    });
  });

  it('never asks for a span the server would refuse', () => {
    const far = clampReportRange('2020-01-01', TODAY, TODAY, 'to');
    expect(spanDays(far.fromISO, far.toISO)).toBeLessThanOrEqual(MAX_REPORT_SPAN_DAYS);
    expect(far.toISO).toBe(TODAY);

    // Touching From with a date too old for any `to`: the touched end gives way once `to` hits today.
    const old = clampReportRange('2020-01-01', '2020-06-01', TODAY, 'from');
    expect(spanDays(old.fromISO, old.toISO)).toBeLessThanOrEqual(MAX_REPORT_SPAN_DAYS);
  });

  it('allows exactly the limit, and one day more is pulled back to it', () => {
    const atLimit = shiftDays(TODAY, -(MAX_REPORT_SPAN_DAYS - 1));
    expect(clampReportRange(atLimit, TODAY, TODAY, 'to')).toEqual({ fromISO: atLimit, toISO: TODAY });
    const overBy1 = shiftDays(TODAY, -MAX_REPORT_SPAN_DAYS);
    expect(clampReportRange(overBy1, TODAY, TODAY, 'to').fromISO).toBe(atLimit);
  });

  it('falls back to the default week when a field holds nothing usable', () => {
    expect(clampReportRange('', '', TODAY)).toEqual(defaultReportRange(TODAY));
    expect(clampReportRange('02-11-2026', TODAY, TODAY)).toEqual({ fromISO: '2026-10-27', toISO: TODAY });
  });

  it('accepts a single day', () => {
    expect(clampReportRange(TODAY, TODAY, TODAY, 'from')).toEqual({ fromISO: TODAY, toISO: TODAY });
  });
});
