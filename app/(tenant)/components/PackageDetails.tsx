'use client';

import { useRef } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { formatMoney } from '../lib/api';
import { useNewVisitCopy } from '../lib/use-copy';

/**
 * What a package holds, over the screen it was opened from (owner, 2026-10-07).
 *
 * A package row says "3 services · ₹399" — enough to recognise one, not enough to sell one or to answer "what do I
 * get?" at the counter. This lists each service with what it costs on its own, then what they come to, the package's
 * one price and the saving, and offers the same add/take-off the row does, so reading it never costs a second tap.
 * On the app's `.modal` shell, with `useDialog`'s Escape, focus trap and focus return, as `ConfirmDialog` is.
 */
export function PackageDetails({
  title,
  services,
  priceMinor,
  onBill,
  disabled = false,
  onToggle,
  onClose,
}: {
  title: string;
  services: { id: string; name: string; priceMinor: string | null; durationMin: number }[];
  /** The package's own price; null when it has none and is charged at its services' prices. */
  priceMinor: string | null;
  onBill: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const nv = useNewVisitCopy();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });

  const separately = services.reduce((sum, s) => sum + Number(s.priceMinor ?? 0), 0);
  const saving = priceMinor ? Math.max(0, separately - Number(priceMinor)) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-fit pkg-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pkg-details-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pkg-details-title">{title}</h3>
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
                <div>
                  <dt>{nv.packageSeparately}</dt>
                  <dd className="pkg-details-was">{formatMoney(String(separately))}</dd>
                </div>
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
          {/* After the list, not in it: a <dl> holds term/description groups only. */}
          {priceMinor && saving > 0 ? <p className="pkg-details-saves">{nv.comboSaves(formatMoney(String(saving)))}</p> : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {nv.close}
          </button>
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => {
              onToggle();
              onClose();
            }}
          >
            {onBill ? nv.takeOffBill : nv.addToBill}
          </button>
        </div>
      </div>
    </div>
  );
}
