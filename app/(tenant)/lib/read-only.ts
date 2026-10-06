/**
 * Jira GRW-556 (follow-up) — is this business allowed to change anything?
 *
 * False only for a business suspended for non-payment, which signs in READ-ONLY: it sees all its own data and can
 * pay its bill, and changes nothing else (GRW-168's lockout is superseded). The API is what refuses — its guard asks
 * `operability.writes` — and this is the half that stops the dashboard OFFERING what would be refused, so an owner
 * is never shown an Add or Save button that can only answer "suspended" (the failure GRW-409 was written to end).
 *
 * `provisioning` is writable here: it is closed by SCREEN (`go-live.ts`), not by control, because setup is a set of
 * destinations. Suspended is a set of ACTIONS, so it rides `mayUse`'s writability instead.
 *
 * Fails open, like `isLive`: an older API, a failed `/me` and every other status read as writable, so a degraded
 * session is never shut out of its own product. The API still refuses what it must — this is a courtesy, never the gate.
 */
export function isWritable(status: string | null | undefined): boolean {
  return status !== 'suspended';
}
