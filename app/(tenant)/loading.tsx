import { useTranslations } from 'next-intl';

/**
 * Jira GRW-478 (U-14) — a tap on the menu answers at once.
 *
 * Every screen is rendered on the server per request, and with no loading state a tap on slow 3G did nothing
 * visible until the server answered — so it was tapped again. This shows in the shell's `<main>` the moment the
 * route starts changing; the sidebar and header stay put.
 */
export default function ScreenLoading() {
  const t = useTranslations('common');
  return (
    <div className="page-body screen-loading" role="status" aria-live="polite">
      <span className="screen-loading-bar" aria-hidden="true" />
      <span className="screen-loading-text">{t('loading')}</span>
    </div>
  );
}
