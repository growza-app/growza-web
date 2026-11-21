/**
 * Jira GRW-745 FR-02 — the till's order type lives in the address (`/pos?type=dine-in|takeaway|delivery`), so a refresh or
 * Back keeps it. Written with `history.replaceState`: changing the type is not a page to go back to, and nothing reloads.
 */
export type TillOrderType = 'dine_in' | 'takeaway' | 'delivery';

const TO_URL: Record<TillOrderType, string> = { dine_in: 'dine-in', takeaway: 'takeaway', delivery: 'delivery' };

/** The type named in an address's `type`, or null when it names none (an unknown value is none: the till's default holds). */
export function orderTypeOf(param: string | null | undefined): TillOrderType | null {
  if (param === 'dine-in') return 'dine_in';
  if (param === 'takeaway') return 'takeaway';
  if (param === 'delivery') return 'delivery';
  return null;
}

export function orderTypeFromUrl(): TillOrderType | null {
  if (typeof window === 'undefined') return null;
  return orderTypeOf(new URLSearchParams(window.location.search).get('type'));
}

export function writeOrderTypeToUrl(next: TillOrderType): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('type', TO_URL[next]);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* an address that cannot be written: the type still changes on screen */
  }
}
