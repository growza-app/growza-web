'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { IconArrowLeft } from './icons';

/**
 * The header's Back arrow. PageHeader is a server component, so the word "Back" is spoken from here.
 *
 * Jira GRW-497 — with no `onBack` it steps back through history, and goes Home when there is none
 * (a screen opened straight from a link has nothing behind it, and a button that does nothing is worse
 * than one that goes somewhere). `phoneOnly` is for the screens that wear it where Home wears the menu
 * button: from 861px the sidebar is on screen and there is no Back.
 */
export function BackButton({ onBack, phoneOnly }: { onBack?: () => void; phoneOnly?: boolean }) {
  const t = useTranslations('chrome');
  const router = useRouter();
  const back = onBack ?? (() => (window.history.length > 1 ? router.back() : router.push('/')));
  return (
    <button type="button" className={`staff-icon-btn topbar-back ${phoneOnly ? 'topbar-back-phone' : ''}`} aria-label={t('back')} onClick={back}>
      <IconArrowLeft />
    </button>
  );
}
