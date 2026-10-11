'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useDialog } from '../../shared/a11y/useDialog';
import { PACK_KEY_LIST, packPhotoUrl } from '../lib/service-photos';

/**
 * Choosing a picture for a service from the ones we supply.
 *
 * The picture normally comes from matching the service's name, and a brand or local name ("Shahnaz Gold Facial")
 * matches nothing. Rather than chase every salon's words with an ever-longer list, the owner picks the closest
 * picture themselves. Same files the list already shows, so this costs no extra image weight.
 *
 * A tap picks and closes: there is nothing else to decide here.
 *
 * Owner, 2026-10-11 — `onUpload` makes this the ONE door to a service's picture rather than the second one.
 * The Services list used to go straight to the file chooser, so an owner working from the list (which is where
 * an owner works) only ever met "upload your own" and never learnt these forty existed. Opening this instead,
 * with the upload offered inside it, puts both answers in one place. The edit form leaves it off: it has the
 * upload on the row above, and a second one here would be the same button twice.
 */
export function PackPhotoSheet({
  current,
  onPick,
  onUpload,
  onClose,
}: {
  /** The key now in force, ticked in the grid. */
  current: string | null;
  onPick: (key: string) => void;
  /** Offered only where this sheet is the only door — see the note above. */
  onUpload?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('services.form.pack');
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose });

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        // The form behind has its own backdrop; a tap here must not reach it.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal sheet pack-photo-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span />
          <span className="sheet-head-title">{t('title')}</span>
          <button type="button" className="sheet-head-save" onClick={onClose}>
            {t('done')}
          </button>
        </div>
        <div className="sheet-body">
          <div className="sheet-foot">{t('hint')}</div>
          {/* Above the grid, because an owner who has their own photograph of this service wants it and nothing else. */}
          {onUpload ? (
            <button type="button" className="btn btn-ghost pack-photo-upload" onClick={onUpload}>
              {t('upload')}
            </button>
          ) : null}
          <div className="pack-photo-grid">
            {PACK_KEY_LIST.map((key) => (
              <button
                key={key}
                type="button"
                className={`pack-photo-tile ${key === current ? 'is-picked' : ''}`}
                aria-pressed={key === current}
                onClick={() => onPick(key)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={packPhotoUrl(key) ?? ''} alt="" width={96} height={96} loading="lazy" />
                <span>{t(`labels.${key}` as 'labels.haircut')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
