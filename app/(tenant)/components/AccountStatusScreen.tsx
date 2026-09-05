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
  /** Absent until SUPPORT_EMAIL / SUPPORT_PHONE are configured. Never invented. */
  support?: { email?: string; phone?: string };
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
        {support?.phone || support?.email ? (
          <div className="account-status-contacts">
            {support.phone ? (
              <a className="account-status-contact" href={`tel:${support.phone.replace(/\s+/g, '')}`}>
                Call support
              </a>
            ) : null}
            {support.email ? (
              <a className="account-status-contact" href={`mailto:${support.email}`}>
                Email support
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
