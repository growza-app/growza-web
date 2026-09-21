'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api, type SeedCatalog } from '../lib/api';
import { pickNoun } from '../lib/nouns';

export type AddServicesRoute = 'catalogue' | 'sheet' | 'manual';

/**
 * "hair, skin, nails, spa and bridal" — read off the catalogue, never written down here.
 * The list joiner comes from the language (`en-GB` keeps English's "a, b and c" with no serial comma).
 */
function categoryPhrase(catalog: SeedCatalog, locale: string): string | null {
  const names = catalog.categories.map((c) => c.name.toLowerCase());
  if (names.length === 0) return null;
  return new Intl.ListFormat(locale === 'en' ? 'en-GB' : locale, { style: 'long', type: 'conjunction' }).format(names);
}

/**
 * Board 3a — the chooser, already specific.
 *
 * The tenant pins a vertical, so the first option names the actual catalogue and
 * its size instead of asking what kind of business this is. Single manual entry
 * stays available underneath.
 */
export function AddServicesChooser({
  tenantName,
  serviceCount,
  serviceLabel,
  onPick,
  onClose,
}: {
  tenantName: string | null;
  serviceCount: number;
  /** The plural noun, already lower-case and in the owner's language. */
  serviceLabel: string;
  onPick: (route: AddServicesRoute) => void;
  onClose: () => void;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('services.chooser');
  const tn = useTranslations('nouns');
  const locale = useLocale();
  const singular = pickNoun(locale, serviceLabel.replace(/s$/, ''), tn('service'));
  const phrase = (c: SeedCatalog) => categoryPhrase(c, locale);
  const [catalog, setCatalog] = useState<SeedCatalog | null>(null);

  useEffect(() => {
    let live = true;
    api
      .seedCatalog()
      .then((c) => live && setCatalog(c))
      .catch(() => {
        /* The catalogue row simply does not offer itself if the vertical has none. */
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal chooser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chooser-head">
          <div>
            <h3>{t('addLabel', { label: serviceLabel })}</h3>
            <span className="muted">
              {tenantName
                ? tc('listsNamed', { tenant: tenantName, count: serviceCount, label: serviceLabel })
                : tc('lists', { count: serviceCount, label: serviceLabel })}
            </span>
          </div>
          <button type="button" className="icon-btn" aria-label={tc('close')} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="chooser-routes">
          {catalog && catalog.total > 0 && (
            <button type="button" className="chooser-route is-primary" onClick={() => onPick('catalogue')}>
              <span className="chooser-icon is-primary">✦</span>
              <span className="chooser-body">
                <span className="chooser-title">
                  {tc('catalogueTitle', { label: catalog.label, count: catalog.total })}
                  <span className="chip chip-fastest">{tc('fastest')}</span>
                </span>
                <span className="muted">
                  {phrase(catalog) ? tc('catalogueDescWith', { phrase: phrase(catalog)! }) : tc('catalogueDescPlain')}
                </span>
              </span>
              <span className="chooser-chevron">›</span>
            </button>
          )}

          <button type="button" className="chooser-route" onClick={() => onPick('sheet')}>
            <span className="chooser-icon">⇪</span>
            <span className="chooser-body">
              <span className="chooser-title">{tc('uploadTitle')}</span>
              <span className="muted">{tc('uploadSub')}</span>
            </span>
            <span className="chooser-chevron">›</span>
          </button>

          {/* Board 3d. Deliberately inert until GRW-022 ships — an option that does
              nothing is worse than one that says it is not ready yet. */}
          <div className="chooser-route is-disabled" aria-disabled="true">
            <span className="chooser-icon">▤</span>
            <span className="chooser-body">
              <span className="chooser-title">
                {tc('photoTitle')}
                <span className="chip chip-beta">{tc('notYet')}</span>
              </span>
              <span className="muted">{tc('photoSub')}</span>
            </span>
          </div>

          <div className="chooser-or">
            <span />
            <span className="muted">{tc('or')}</span>
            <span />
          </div>

          <button type="button" className="chooser-route is-plain" onClick={() => onPick('manual')}>
            <span className="chooser-title">{tc('manual', { singular })}</span>
            <span className="chooser-chevron">›</span>
          </button>
        </div>
      </div>
    </div>
  );
}
