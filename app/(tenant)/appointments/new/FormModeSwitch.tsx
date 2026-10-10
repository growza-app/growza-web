'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Simple ⇄ Advanced, for Record payment on a phone (owner, 2026-10-10).
 *
 * The way to the one-page form used to be a ☰ in the corner of the three-tap screen. It looked like a menu,
 * opened a different form, and there was no way back from that form except the browser's own Back — so the
 * thing it did was unguessable in one direction and impossible in the other.
 *
 * Two labelled halves say what both are and which one you are on, and either half is a link, so the switch
 * works the same from whichever side you are standing on. Links rather than buttons because each really is a
 * different address (`?full=1`), which also means Back behaves and the choice survives a reload.
 */
export function FormModeSwitch({ simpleHref, advancedHref, now }: { simpleHref: string; advancedHref: string; now: 'simple' | 'advanced' }) {
  const t = useTranslations('payFlow');
  return (
    <div className="pf-modes" role="group" aria-label={t('formMode')}>
      <Link href={simpleHref} className={`pf-mode ${now === 'simple' ? 'pf-mode-on' : ''}`} aria-current={now === 'simple' ? 'page' : undefined}>
        {t('simple')}
      </Link>
      <Link href={advancedHref} className={`pf-mode ${now === 'advanced' ? 'pf-mode-on' : ''}`} aria-current={now === 'advanced' ? 'page' : undefined}>
        {t('advanced')}
      </Link>
    </div>
  );
}
