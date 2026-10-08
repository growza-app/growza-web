'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { formatMoney } from '../lib/api';
import { useNewVisitCopy } from '../lib/use-copy';

/**
 * What a package holds, opened by tapping its row on the Packages screen.
 *
 * The same sheet the bill uses (`PackageDetails`) without its add-to-bill button — nothing is being billed here.
 * Each service with its own price, what they come to separately, the package's one price and the saving.
 * Edit is offered only to someone who may change it.
 */
export function PackageOverview({
  title,
  services,
  priceMinor,
  missingNote,
  editHref,
  editLabel,
  onClose,
}: {
  title: string;
  services: { id: string; name: string; priceMinor: string | null }[];
  priceMinor: string | null;
  /** Set when a service in the package has been deleted: the sums below would be over a part of it, so they are left out. */
  missingNote: string | null;
  /** Null when the person may not edit (read-only business, or a role without the screen's writes). */
  editHref: string | null;
  editLabel: string;
  onClose: () => void;
}) {
  const nv = useNewVisitCopy();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });

  const separately = services.reduce((sum, s) => sum + Number(s.priceMinor ?? 0), 0);
  const complete = missingNote === null;
  const saving = complete && priceMinor ? Math.max(0, separately - Number(priceMinor)) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-fit pkg-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pkg-overview-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pkg-overview-title">{title}</h3>
        <div className="modal-body">
          <p className="pkg-details-count">{nv.comboServices(services.length)}</p>
          <ul className="pkg-details-list">
            {services.map((s) => (
              <li key={s.id} className="pkg-details-row">
                <span className="pkg-details-name">{s.name}</span>
                <span className="pkg-details-price">{formatMoney(s.priceMinor)}</span>
              </li>
            ))}
          </ul>
          <dl className="pkg-details-sum">
            {priceMinor ? (
              <>
                {complete && (
                <div>
                  <dt>{nv.packageSeparately}</dt>
                  <dd className="pkg-details-was">{formatMoney(String(separately))}</dd>
                </div>
                )}
                <div className="pkg-details-total">
                  <dt>{nv.packagePrice}</dt>
                  <dd>{formatMoney(priceMinor)}</dd>
                </div>
              </>
            ) : (
              <div className="pkg-details-total">
                <dt>{nv.total}</dt>
                <dd>{formatMoney(String(separately))}</dd>
              </div>
            )}
          </dl>
          {missingNote && <p className="pkg-missing">{missingNote}</p>}
          {priceMinor && saving > 0 ? <p className="pkg-details-saves">{nv.comboSaves(formatMoney(String(saving)))}</p> : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {nv.close}
          </button>
          {editHref && (
            <Link href={editHref} className="btn" style={{ textDecoration: 'none' }}>
              {editLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
