/**
 * Jira GRW-222 — which language the dashboard chrome speaks.
 *
 * Two, and English is the default. Hindi arrived with the Home redesign, whose
 * design carried every Home, header and navigation string in both languages;
 * it covers exactly those surfaces. Every other screen still reads `copy.ts`,
 * which is English — so switching to Hindi today changes Home and the nav, and
 * nothing else. That boundary is stated here rather than discovered.
 *
 * A cookie, not localStorage, because Home is a server component: the page has
 * to know the language while it renders, before any browser code runs, or it
 * paints in English and flips.
 */
export type Lang = 'en' | 'hi';

export const LANG_COOKIE = 'growza_lang';

/** Anything that is not exactly 'hi' is English — a garbled cookie must not blank the screen. */
export function toLang(value: string | null | undefined): Lang {
  return value === 'hi' ? 'hi' : 'en';
}

/** Server components: the viewer's language, from the request's cookie. */
export async function serverLang(): Promise<Lang> {
  try {
    const { cookies } = await import('next/headers');
    return toLang((await cookies()).get(LANG_COOKIE)?.value);
  } catch {
    return 'en';
  }
}

/**
 * Client components: remember a choice locally.
 *
 * Jira GRW-329 — this is now a CACHE of the person's stored preference, not the
 * record of it. `saveLang` below is what makes it last; this on its own is
 * per-device and mortal, which is how a stylist who chose Hindi ended up back
 * in English a year later, and on every new phone in between.
 */
export function rememberLang(lang: Lang): void {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Jira GRW-329 — a save that has been asked for but not confirmed.
 *
 * The cookie changes the instant the person taps, and the account catches up
 * over the network. In between — and for good, if the save fails — the two
 * DISAGREE, and `decideLangSync` must not read that disagreement as a stale
 * cookie or it reverts the very thing the person just chose. Found by QA on a
 * simulated slow network: tap Hindi, and the screen went Hindi → English.
 *
 * `localStorage` so it survives a reload and a failed save is retried on the
 * next page load; an in-memory copy as the fallback when storage is blocked
 * (private windows), which still covers everything except a reload.
 */
const PENDING_KEY = 'growza_lang_pending';
let pendingInMemory: Lang | null = null;

export function getPendingLang(): Lang | null {
  try {
    const v = localStorage.getItem(PENDING_KEY);
    if (v === 'en' || v === 'hi') return v;
  } catch {
    /* storage blocked — fall through to memory */
  }
  return pendingInMemory;
}

export function setPendingLang(lang: Lang | null): void {
  pendingInMemory = lang;
  try {
    if (lang) localStorage.setItem(PENDING_KEY, lang);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked — the in-memory copy above still holds */
  }
}

/** One attempt to write the preference to the person's account. `true` only when the server accepted it. */
export async function putLang(lang: Lang): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/me/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Jira GRW-329 — keep the choice on the person's account, not just this browser.
 *
 * The cookie is written FIRST and unconditionally, so the language changes
 * immediately and still changes when the network is down — the person asked for
 * a different language, and the one thing they must not get is nothing
 * happening. The account write is what makes it survive a new phone, a
 * reinstall, cleared data and a shared tablet.
 *
 * Until the server confirms, the choice is marked pending, so the screen keeps
 * what the person picked and the save is retried on the next page load instead
 * of being silently dropped.
 */
export async function saveLang(lang: Lang): Promise<void> {
  rememberLang(lang);
  setPendingLang(lang);
  if ((await putLang(lang)) && getPendingLang() === lang) setPendingLang(null);
}

export type LangSyncAction =
  | { kind: 'none' }
  /** Put the cookie back to the account's value and re-render. */
  | { kind: 'set-cookie'; lang: Lang }
  /** Send this language to the account (a retry, or adopting a pre-existing choice). */
  | { kind: 'push'; lang: Lang }
  /** The account already holds what was pending; drop the marker. */
  | { kind: 'clear-pending' };

/**
 * Jira GRW-329 — what to do about the cookie and the account disagreeing.
 *
 * Pure, and pulled out of the component because every branch is a way this
 * feature was found to be wrong: order matters and a component cannot be
 * unit-tested for it.
 *
 * 1. A pending save wins over everything. The person chose; the account has not
 *    heard yet. Retry it, and never revert the screen.
 * 2. Otherwise the account is the record. A cookie that disagrees is stale —
 *    lost, expired, or overtaken by a change made on another device — so it is
 *    put back.
 * 3. An account with NO choice, on a browser showing Hindi, is somebody who
 *    picked Hindi before this feature existed, when the cookie was the only
 *    record. Adopt it, or they lose it on their next new phone. Only Hindi:
 *    English is what everyone gets anyway, so there is nothing to preserve, and
 *    writing it would turn "never chose" into "chose English" for everyone.
 */
export function decideLangSync(input: {
  stored: string | null | undefined;
  rendered: Lang;
  pending: Lang | null;
}): LangSyncAction {
  const { stored, rendered, pending } = input;
  if (pending) return toLang(stored) === pending && stored ? { kind: 'clear-pending' } : { kind: 'push', lang: pending };
  if (stored) {
    const want = toLang(stored);
    return want === rendered ? { kind: 'none' } : { kind: 'set-cookie', lang: want };
  }
  return rendered === 'hi' ? { kind: 'push', lang: 'hi' } : { kind: 'none' };
}
