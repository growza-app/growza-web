'use client';

import { useTranslations } from 'next-intl';

/**
 * Jira GRW-478 (U-1) — a screen that throws stays inside the app.
 *
 * There was no error boundary anywhere, so one bad response showed Next's own unbranded English page with no
 * navigation: the person at the desk lost the sidebar, the header and any way back but the browser's. This sits
 * inside the shell's `<main>`, so the rest of the app stays where it was and only the broken screen is replaced.
 */
export default function ScreenError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  return (
    <div className="page-body">
      <div className="banner" role="alert">
        <strong>{t('crashed')}</strong> {t('crashedHelp')}
      </div>
      <div className="screen-error-actions">
        <button type="button" className="btn" onClick={reset}>
          {t('tryAgain')}
        </button>
        <a className="btn-ghost" href="/">
          {t('backHome')}
        </a>
      </div>
    </div>
  );
}
