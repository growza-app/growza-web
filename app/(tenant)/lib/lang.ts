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

/** Client components: remember a choice for a year, then re-render the server tree. */
export function rememberLang(lang: Lang): void {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
