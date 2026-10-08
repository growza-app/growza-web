/**
 * One key per opening of a form, sent with every try, so a retry after a lost response is the same request.
 *
 * Not `crypto.randomUUID()`: that needs a secure context and is missing on plain http, which is how the dev box is
 * reached. This only has to be unique per form opening; it matches the API's `[A-Za-z0-9-]{8,64}`.
 */
export function newAttemptKey(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
