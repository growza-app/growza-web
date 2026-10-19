import { api } from './api';
import { whatsappHref } from './receipt-text';

/**
 * Jira GRW-582 — sending a customer their document on WhatsApp, as a link.
 *
 * ## Why a link and not a file
 *
 * A file would have to be rendered and stored on the server, and WhatsApp's `wa.me` cannot attach one anyway. A link is
 * a row in the database and a page drawn from the record on every visit: nothing is generated or kept, and when it
 * runs out (a week, by the owner's decision) the business simply sends a new one.
 *
 * The address is on the dashboard's own origin (`/d/<token>`, rewritten to the API in next.config.ts), so it is short
 * enough to read in a chat and is the same host the business already trusts.
 */
export function sharedDocumentUrl(origin: string, token: string): string {
  return `${origin}/d/${token}`;
}

/** Whole days from now to `expiresAt`, never below one: a link with hours left is still "a day", not "0 days". */
export function daysUntil(expiresAt: string, now: number = Date.now()): number {
  return Math.max(1, Math.round((new Date(expiresAt).getTime() - now) / 86_400_000));
}

/**
 * Makes a link and opens WhatsApp with the message and the link in it.
 *
 * **The window is opened first, inside the tap, and pointed at WhatsApp afterwards.** A window opened after an `await`
 * is no longer inside the user's gesture, and phones treat it as a pop-up and block it — which would mean the link was
 * made, the owner saw nothing happen, and tapped again for a second link.
 *
 * `phone` may be empty: `wa.me/?text=` lets the owner pick the chat themselves, which beats refusing to share a
 * document with a client whose number was never typed in.
 */
export async function sendDocumentOnWhatsApp(opts: {
  id: string;
  phone: string | null;
  /** The message around the link; the caller owns the wording so it can be translated. */
  compose: (link: string, days: number) => string;
}): Promise<void> {
  const win = window.open('', '_blank');
  // The tab we opened has no business holding a reference back to the dashboard.
  if (win) win.opener = null;
  try {
    const { token, expiresAt } = await api.shareDocument(opts.id);
    const link = sharedDocumentUrl(window.location.origin, token);
    const href = whatsappHref((opts.phone ?? '').replace(/\D/g, ''), opts.compose(link, daysUntil(expiresAt)));
    if (win) win.location.href = href;
    else window.location.href = href;
  } catch (error) {
    win?.close();
    throw error;
  }
}
