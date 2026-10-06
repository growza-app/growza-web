'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { IconCheck } from './icons';
import { SAVED_MARKER } from '../lib/close-after-save';

/**
 * Jira GRW-556 (follow-up) — "Saved", on the list a form closed back to.
 *
 * The form used to stay open to say it; now it closes (`useCloseAfterSave`) and this says it here. Read once from the
 * address and then taken out of it, the way `PaymentConfirming` does, so a refresh or a bookmark does not say it again.
 * Gone by itself after a few seconds; it is a confirmation, not something to act on.
 */
const SHOW_MS = 3000;

export function SavedToast() {
  const t = useTranslations('chrome');
  const params = useSearchParams();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (params.get(SAVED_MARKER) !== '1') return;
    setShown(true);
    const url = new URL(window.location.href);
    url.searchParams.delete(SAVED_MARKER);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    const timer = setTimeout(() => setShown(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [params]);

  if (!shown) return null;
  return (
    <div className="saved-toast" role="status" data-testid="saved-toast">
      <IconCheck />
      {t('savedToast')}
    </div>
  );
}
