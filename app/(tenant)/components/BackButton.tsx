'use client';

import { useTranslations } from 'next-intl';
import { IconArrowLeft } from './icons';

/** The header's Back arrow. PageHeader is a server component, so the word "Back" is spoken from here. */
export function BackButton({ onBack, phoneOnly }: { onBack: () => void; phoneOnly?: boolean }) {
  const t = useTranslations('chrome');
  return (
    <button type="button" className={`staff-icon-btn topbar-back ${phoneOnly ? 'topbar-back-phone' : ''}`} aria-label={t('back')} onClick={onBack}>
      <IconArrowLeft />
    </button>
  );
}
