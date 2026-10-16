/**
 * Date range and CSV export helpers for the Sales register (/sales).
 * Extracted into a plain module so both the Server Component (`page.tsx`)
 * and the Client Component (`SalesClient.tsx`) can import them cleanly.
 */

export const MAX_SALES_DATE_YEARS = 5;
export const MAX_SALES_EXPORT_ROWS = 5000;

/**
 * Computes the earliest selectable date (`minISO`, 5 calendar years before `todayISO`)
 * and clamps `[fromISO, toISO]` so the date range is never older than 5 years or after `todayISO`.
 */
export function clampSalesDateRange(
  fromISO: string,
  toISO: string,
  todayISO: string,
  maxYears = MAX_SALES_DATE_YEARS,
): { fromISO: string; toISO: string; minISO: string; maxISO: string } {
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const maxISO = isoRe.test(todayISO) ? todayISO : new Date().toISOString().slice(0, 10);
  const [y = 2026, m = 1, d = 1] = maxISO.split('-').map(Number);
  const minYear = y - maxYears;
  const maxDayInMonth = new Date(Date.UTC(minYear, m, 0)).getUTCDate();
  const minISO = new Date(Date.UTC(minYear, m - 1, Math.min(d, maxDayInMonth))).toISOString().slice(0, 10);

  let safeFrom = isoRe.test(fromISO) ? fromISO : maxISO;
  if (safeFrom < minISO) safeFrom = minISO;
  if (safeFrom > maxISO) safeFrom = maxISO;

  let safeTo = isoRe.test(toISO) ? toISO : safeFrom;
  if (safeTo < safeFrom) safeTo = safeFrom;
  if (safeTo > maxISO) safeTo = maxISO;

  return { fromISO: safeFrom, toISO: safeTo, minISO, maxISO };
}
