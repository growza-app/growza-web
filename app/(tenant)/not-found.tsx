import { useTranslations } from 'next-intl';

/**
 * Jira GRW-478 (U-1) — `notFound()` from any screen lands here, inside the shell, in the page's language. It was
 * Next's English "404 | This page could not be found." with no way back but the browser's.
 */
export default function ScreenNotFound() {
  const t = useTranslations('errors');
  return (
    <div className="page-body">
      <div className="banner" role="status">
        <strong>{t('notFound')}</strong> {t('notFoundHelp')}
      </div>
      <div className="screen-error-actions">
        <a className="btn" href="/">
          {t('backHome')}
        </a>
      </div>
    </div>
  );
}
