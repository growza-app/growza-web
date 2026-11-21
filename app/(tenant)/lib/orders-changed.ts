/**
 * Owner, 2026-11-21 ("paid it and Home still said Payment pending … don't put too much query on the database") — how an open
 * Home learns that an order changed, without polling.
 *
 * The browser that changed an order says so: a write to `localStorage` reaches every OTHER tab of this browser as a `storage`
 * event, and a window event reaches this tab. Home then reads its orders once. Nothing is sent to the server to announce it,
 * and nothing is read when nothing changed. Another device's change is picked up when Home is looked at again (see
 * `ORDERS_STALE_MS`), never on a timer.
 */
export const ORDERS_CHANGED_KEY = 'growza.orders.changed';
export const ORDERS_CHANGED_EVENT = 'growza:orders-changed';
/** A Home shown again after this long reads its orders once more (a change made on another phone or till). */
export const ORDERS_STALE_MS = 60_000;

/** The writes that change an order or a table's bill: a sale (paid, kept pending, added to, settled, cancelled), an order, a seat. */
const ORDER_WRITES = /^\/api\/v1\/(counter-sales|orders\/|tables\/)/;

export function changesOrders(path: string): boolean {
  return ORDER_WRITES.test(path);
}

export function announceOrdersChanged(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ORDERS_CHANGED_KEY, String(now));
  } catch {
    /* storage blocked: other tabs catch up when looked at again */
  }
  try {
    window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
  } catch {
    /* no window events: nothing else to do */
  }
}
