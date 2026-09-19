/**
 * Jira GRW-79 · GRW-164 — what an owner sees when their account cannot operate.
 *
 * The card's Error Handling row asks for "a clear account-status screen naming
 * who to contact, not a 403 or a crash". Before this, a live session hitting a
 * suspension got the dashboard shell with no data in it — a broken-looking
 * product, which is exactly what BR-03 forbids.
 *
 * The message is the SERVER'S, passed straight through. The wording lives once,
 * in `platform/tenant-status.ts`, so the screen and the API cannot word the same
 * situation differently — the mistake commit `895e9ac` is this repo's record of.
 */
export function AccountStatusScreen({
  message,
  support,
}: {
  message: string;
  /**
   * The support line to ring. Present on every refusal now: the API falls back
   * to a real number when `SUPPORT_PHONE` is unset, rather than leaving a
   * locked-out owner a screen that says "contact support" with nothing to ring.
   * Still optional here, because the API is free to send no contacts and this
   * screen must render without them.
   */
  support?: { phone?: string };
}) {
  return (
    <main className="account-status">
      <div className="account-status-card">
        <span className="account-status-mark" aria-hidden>
          !
        </span>
        <h1>Growza</h1>
        <p role="alert">{message}</p>

        {/* The buttons are the ACTION; the sentence above is the information.
            They deliberately do not repeat the number — at 320px that read as
            the same thing said twice, and a tap-to-call button means nobody has
            to retype it anyway. Nothing renders when nothing is configured. */}
        {support?.phone ? (
          <div className="account-status-contacts">
            <a className="account-status-contact" href={`tel:${support.phone.replace(/\s+/g, '')}`}>
              Call support
            </a>
          </div>
        ) : null}
      </div>
    </main>
  );
}
