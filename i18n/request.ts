import { getRequestConfig } from 'next-intl/server';
import { serverLang } from '../app/(tenant)/lib/lang';
import en from '../messages/en.json';
import { withFallback, type Messages } from './messages';

/**
 * Jira GRW-319 — which language, and its messages, for this request.
 *
 * The language is the existing `growza_lang` cookie (`serverLang`): no URL
 * prefix, no redirect, no middleware. English is always the base, so a string
 * not yet translated shows English rather than a blank. Only the requested
 * language's file is loaded, and it happens on the server: nothing is fetched
 * from the browser and no translation service is called.
 */
export default getRequestConfig(async () => {
  const locale = await serverLang();
  const wanted = locale === 'en' ? {} : ((await import(`../messages/${locale}.json`)).default as Messages);
  return { locale, messages: withFallback(en as Messages, wanted) };
});
