import type en from '../messages/en.json';

/** Typed keys: `t('errors.busyy')` is a compile error, not a blank on screen. */
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'en' | 'hi';
    Messages: typeof en;
  }
}
