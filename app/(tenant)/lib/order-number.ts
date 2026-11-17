import { formatTokenNo } from '../pos/pos-helpers';

/**
 * QA 10 Nov 2026 — the number an order goes by on every screen: its token (#08), the one the guest holds, when it has
 * one; otherwise its 8-letter code (#2C26F314) — a marketplace order, or one from before tokens were stored. One
 * function, so the list, the order's page and Home can never disagree about which number an order is.
 */
export function orderNumber(o: { code: string; tokenNo?: number | null; offlineToken?: string | null }): string {
  // Jira GRW-716 — an order taken offline goes by its till's token ("A12"), the one printed on the guest's slip.
  if (o.offlineToken) return o.offlineToken;
  return o.tokenNo ? formatTokenNo(o.tokenNo) : `#${o.code.toUpperCase()}`;
}
