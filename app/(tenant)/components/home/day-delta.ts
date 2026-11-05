/**
 * Jira GRW-679 (UX-04) — "compared with yesterday", said only when it means something.
 *
 * The restaurant's Home read "↓ −100% vs yesterday" beside ₹0 at 1:40 am: a day that had not started, measured
 * against all of yesterday, every morning. The phone's hero already had the rule (`MoneyHero`, BR-08: no badge until
 * something has come in); the desktop cards did not. Worse, when yesterday had no sales the desktop cards showed a
 * figure that was not worked out from anything: "+12%" for takings and "+4%" for orders.
 *
 * So one rule, for every card: no comparison until this period has something in it, and none when there is nothing
 * to compare with. `null` means "say nothing".
 */
export function periodDeltaPct(current: number, previous: number): number | null {
  if (!(current > 0)) return null;
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * The words for it: "↑ 12%", "↓ 59%", "0%". The arrow carries the direction, so the number carries no sign — the
 * card used to say "↓ −59%", the same thing twice.
 */
export function deltaLabel(pct: number): string {
  if (pct === 0) return '0%';
  return `${pct < 0 ? '↓' : '↑'} ${Math.abs(pct)}%`;
}
