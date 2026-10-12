/**
 * Jira GRW-564 — the two addresses the help screen offers, built from `/me`.
 *
 * Pure and separate from the page because the `wa.me` URL is the only part of
 * that screen with rules to get wrong: the number carries no `+` and no
 * spaces, and the message has to survive percent-encoding. A screenshot proves
 * a link was drawn; this proves it goes to the right place.
 */

/** A role as `/me` spells it, mapped to the message key that names it in the reader's language. */
export const ROLE_KEY = {
  owner: 'roles.owner',
  manager: 'roles.manager',
  receptionist: 'roles.receptionist',
  staff: 'roles.staff',
} as const;

export type HelpRole = keyof typeof ROLE_KEY;

export function isHelpRole(role: string | undefined | null): role is HelpRole {
  return role != null && role in ROLE_KEY;
}

/**
 * The details support would otherwise have to ask for, as one line.
 *
 * Nothing is invented: a part that `/me` could not supply is simply absent,
 * and when none of them are the message goes out without the parenthesis
 * rather than with an empty one.
 */
export function supportIntro(parts: { salon?: string; branch?: string | null; roleName?: string | null }): string {
  return [parts.salon, parts.branch, parts.roleName].filter(Boolean).join(' · ');
}

/**
 * `https://wa.me/<digits>?text=<encoded>`, or null when there is no number.
 *
 * Every non-digit is stripped, not just spaces: the numbers arrive from an
 * environment variable a human typed, so `+91 97735 33899`, `+919773533899`
 * and `091-97735-33899` all have to reach the same chat.
 *
 * Leading zeros go too, and that is not tidying. `wa.me` takes an
 * international number; a leading 0 is a NATIONAL trunk prefix, so `0919...`
 * is a different number that does not exist. Caught by the test below rather
 * than in production, which is the whole reason this is a function and not
 * four lines inside the page.
 */
export function whatsappHref(whatsapp: string | undefined, message: string): string | null {
  const digits = (whatsapp?.replace(/\D/g, '') ?? '').replace(/^0+/, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}

/** `tel:` with the spaces taken out, or null when there is no number. */
export function telHref(phone: string | undefined): string | null {
  const trimmed = phone?.trim();
  return trimmed ? `tel:${trimmed.replace(/\s+/g, '')}` : null;
}

/** A number reduced to what identifies the handset, so `+91 97735 33899` and `09773533899` compare equal. */
const digitsOf = (n: string | undefined): string => (n?.replace(/\D/g, '') ?? '').replace(/^0+/, '');

export interface HelpOption {
  /** Its place in the list the reader sees — contiguous, so a dropped option never leaves "Option 1, Option 3". */
  n: number;
  whatsapp: string | null;
  tel: string | null;
}

/**
 * The options the help screen lists, each with the links that are worth drawing.
 *
 * An option is a number to ring and a number to message, answered by whoever holds them. Two things are
 * decided here rather than in the page, because they are rules with ways to get wrong:
 *
 * - **A handset is offered once.** Each option normally has its own number, so each draws its own two
 *   buttons. But the numbers are configuration, and an operator can name one handset twice; two WhatsApp
 *   buttons into one conversation is not two choices. The first option to name a handset keeps it; a later
 *   option that repeats it simply does not draw that button.
 * - **An option with nothing left to offer is dropped**, and the rest renumber.
 *
 * An API older than `options` sends only `phone` and `whatsapp`; that is one option.
 */
export function helpOptions(
  support: { phone?: string; whatsapp?: string; options?: { phone?: string; whatsapp?: string }[] } | undefined,
  message: string,
): HelpOption[] {
  const raw = support?.options?.length ? support.options : [{ phone: support?.phone, whatsapp: support?.whatsapp }];
  const chats = new Set<string>();
  const calls = new Set<string>();
  const out: HelpOption[] = [];
  for (const o of raw) {
    const chat = digitsOf(o.whatsapp);
    const call = digitsOf(o.phone);
    const whatsapp = chat && !chats.has(chat) ? whatsappHref(o.whatsapp, message) : null;
    const tel = call && !calls.has(call) ? telHref(o.phone) : null;
    if (chat) chats.add(chat);
    if (call) calls.add(call);
    if (whatsapp || tel) out.push({ n: out.length + 1, whatsapp, tel });
  }
  return out;
}
