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
export function AccountStatusScreen({ message }: { message: string }) {
  return (
    <main className="account-status">
      <div className="account-status-card">
        <span className="account-status-mark" aria-hidden>
          !
        </span>
        <h1>Growza</h1>
        <p role="alert">{message}</p>
        {/* No navigation, no data, no retry. There is nothing here for them to
            do in the product — the next step is a conversation, and the message
            above says who with. */}
      </div>
    </main>
  );
}
