'use client';

import { useEffect, useState } from 'react';
import { api, type SeedCatalog } from '../lib/api';

export type AddServicesRoute = 'catalogue' | 'sheet' | 'manual';

/** "Hair, skin, nails, spa and bridal" — read off the catalogue, never written down here. */
function categoryPhrase(catalog: SeedCatalog): string {
  const names = catalog.categories.map((c) => c.name.toLowerCase());
  if (names.length === 0) return 'durations and prices pre-filled';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
  serviceLabel: string;
  onPick: (route: AddServicesRoute) => void;
  onClose: () => void;
}) {
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
            <h3>Add {serviceLabel.toLowerCase()}</h3>
            <span className="muted">
              {tenantName ? `${tenantName} currently lists ` : 'You currently list '}
              {serviceCount} {serviceLabel.toLowerCase()}.
            </span>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="chooser-routes">
          {catalog && catalog.total > 0 && (
            <button type="button" className="chooser-route is-primary" onClick={() => onPick('catalogue')}>
              <span className="chooser-icon is-primary">✦</span>
              <span className="chooser-body">
                <span className="chooser-title">
                  {catalog.label} · {catalog.total} services
                  <span className="chip chip-fastest">FASTEST</span>
                </span>
                <span className="muted">
                  {categoryPhrase(catalog)}, with durations and prices pre-filled — edit or drop anything before it
                  saves.
                </span>
              </span>
              <span className="chooser-chevron">›</span>
            </button>
          )}

          <button type="button" className="chooser-route" onClick={() => onPick('sheet')}>
            <span className="chooser-icon">⇪</span>
            <span className="chooser-body">
              <span className="chooser-title">Upload a spreadsheet</span>
              <span className="muted">
                CSV or Excel, any column order — you map the columns once and we check every row before it saves.
              </span>
            </span>
            <span className="chooser-chevron">›</span>
          </button>

          {/* Board 3d. Deliberately inert until GRW-022 ships — an option that does
              nothing is worse than one that says it is not ready yet. */}
          <div className="chooser-route is-disabled" aria-disabled="true">
            <span className="chooser-icon">▤</span>
            <span className="chooser-body">
              <span className="chooser-title">
                Send a photo of your price list
                <span className="chip chip-beta">NOT YET</span>
              </span>
              <span className="muted">
                Photo, PDF, or a menu forwarded on WhatsApp. We read the names and prices; you confirm every row before
                it saves.
              </span>
            </span>
          </div>

          <div className="chooser-or">
            <span />
            <span className="muted">or</span>
            <span />
          </div>

          <button type="button" className="chooser-route is-plain" onClick={() => onPick('manual')}>
            <span className="chooser-title">Add one {serviceLabel.toLowerCase().replace(/s$/, '')} manually</span>
            <span className="chooser-chevron">›</span>
          </button>
        </div>
      </div>
    </div>
  );
}
