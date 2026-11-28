import { ApiError } from './api';

/**
 * Retail hardening 2026-11-28 — one request id per stock action (a delivery, a move, a file), kept until the action is
 * done. A retry after a dropped answer carries the same id, so the API answers it and adds nothing twice.
 *
 * `crypto.randomUUID()` needs a secure context, and the dashboard is reached over plain http on a LAN in testing; the
 * fallback is not cryptographic and does not need to be: the id only has to be unique within one business.
 */
export function newRequestKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Not a secure context: the fallback below.
    }
  }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The API's answer to an id it has seen: still being saved, or already saved with other numbers. The action is not
 * repeated; the screen reloads the count, and the next tap is a new action with a new id.
 */
export function isStockRepeat(err: unknown): boolean {
  const code = err instanceof ApiError ? (err.body as { code?: unknown } | undefined)?.code : undefined;
  return code === 'in_progress' || code === 'already_saved';
}
