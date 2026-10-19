'use client';

import { useTranslations } from 'next-intl';
import { IconClose } from './icons';

/**
 * A small × inside a search box that empties it. Put it straight after the `<input type="search">`, inside the
 * box's wrapper: `<input … />` then `<SearchClear value={search} onClear={() => setSearch('')} />`.
 *
 * Shown only while there is text, so an empty box looks the same as before. The browser's own × is hidden next to
 * it (26-search.css): Chrome drew one only on hover and Firefox none, so the same box cleared differently per
 * browser. After clearing, the cursor goes back into the box so the next name can be typed straight away.
 */
export function SearchClear({ value, onClear }: { value: string; onClear: () => void }) {
  const t = useTranslations('common');
  if (value === '') return null;
  return (
    <button
      type="button"
      className="search-clear"
      aria-label={t('clearSearch')}
      onClick={(e) => {
        onClear();
        const box = e.currentTarget.previousElementSibling;
        if (box instanceof HTMLInputElement) box.focus();
      }}
    >
      <IconClose />
    </button>
  );
}
