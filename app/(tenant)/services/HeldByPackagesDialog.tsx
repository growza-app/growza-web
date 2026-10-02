'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoney } from '../lib/api';
import { IconPackages } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';
import type { HeldPackage } from './held-by-packages';

/**
 * Jira GRW-442 — why a service could not be retired, and what to do about it.
 *
 * A refusal that only refuses leaves the owner to guess. This names every package that holds the service,
 * with what it costs and how many services are in it, and gives one way forward: open the first one.
 *
 * Amber, not red. Nothing is being destroyed here; something is being prevented.
 */
export function HeldByPackagesDialog({
  serviceName,
  packages,
  onClose,
}: {
  serviceName: string;
  packages: HeldPackage[];
  onClose: () => void;
}) {
  const t = useTranslations('services.heldByPackages');
  // A dialog that says `aria-modal` is one that traps: focus in, Tab kept inside, Escape closes, focus returns.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal confirm-modal held-modal"
        role="dialog"
        aria-modal="true"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t('title', { name: serviceName, count: packages.length })}</h3>
        <p className="held-body">{t('body')}</p>

        {/* Scrolls inside the dialog rather than growing it: a service can be in more of these than fit a phone. */}
        <ul className="held-list">
          {packages.map((p) => (
            <li key={p.id}>
              <Link className="held-row" href={`/packages/${p.id}/edit`}>
                <span className="held-row-icon" aria-hidden="true">
                  <IconPackages />
                </span>
                <span className="held-row-text">
                  <span className="held-row-title">{p.title}</span>
                  <span className="held-row-meta">
                    {t('contains', { count: p.serviceCount })} · {formatMoney(p.priceMinor)}
                  </span>
                </span>
                <span className="held-row-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <Link className="btn" href={`/packages/${packages[0]!.id}/edit`}>
            {t('editPackages')}
          </Link>
        </div>
      </div>
    </div>
  );
}
