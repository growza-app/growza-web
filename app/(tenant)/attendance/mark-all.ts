/**
 * The in-time "Mark all present" gives someone: their shift start, unless that is still ahead of the clock today — then
 * now, since they are being marked present because they are here. The server refuses a time that has not happened yet,
 * so a 09:00 shift marked at 08:45 failed for the whole team (salon QA 2026-11-07). `nowHm` is null for a past day.
 */
export function markAllInTime(shiftStart: string | null, nowHm: string | null): string | null {
  if (!shiftStart || !nowHm) return shiftStart;
  return shiftStart > nowHm ? nowHm : shiftStart;
}
