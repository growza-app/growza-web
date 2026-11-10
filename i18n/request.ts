import { getRequestConfig } from 'next-intl/server';
import { serverLang } from '../app/(tenant)/lib/lang';
import en from '../messages/en.json';
import { withFallback, type Messages } from './messages';
import { inVerticalWords } from './vertical-words';

/**
 * Jira GRW-319 — which language, and its messages, for this request.
 *
 * The language is the existing `growza_lang` cookie (`serverLang`): no URL
 * prefix, no redirect, no middleware. English is always the base, so a string
 * not yet translated shows English rather than a blank. Only the requested
 * language's file is loaded, and it happens on the server: nothing is fetched
 * from the browser and no translation service is called.
 *
 * 2026-11-07 — and the English carries the business's own nouns ("Patient", "Therapist", "Job"), from `/me`'s
 * labels: see `vertical-words.ts`. `/me` is read once per render (the layout's own call shares it), and only when a
 * business session cookie is there, so the sign-in screens make no extra call.
 */
async function labelsOfThisBusiness(): Promise<Record<string, string> | null> {
  try {
    /*
     * Owner, 10 Nov 2026 — asked of `/me` whether or not a session cookie is visible here. Gated on the cookie, a
     * business signed in any other way (the local API's DEV_AUTH_BYPASS, which needs none) read every English message
     * in the salon's words: a restaurant guest's card said "Client since". `/me` is the one that knows who is signed in;
     * signed out, it refuses and the messages stay as written (the catch below).
     */
    const { api } = await import('../app/(tenant)/lib/api');
    return (await api.me()).labels ?? null;
  } catch {
    // Signed out, the API down, or outside a request: the messages as written, which is what a salon reads anyway.
    return null;
  }
}

export default getRequestConfig(async () => {
  const locale = await serverLang();
  const wanted = locale === 'en' ? {} : ((await import(`../messages/${locale}.json`)).default as Messages);
  const base = inVerticalWords(en as Messages, await labelsOfThisBusiness());
  return { locale, messages: withFallback(base, wanted) };
});
