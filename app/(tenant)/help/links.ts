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
