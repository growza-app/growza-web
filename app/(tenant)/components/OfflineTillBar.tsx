'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatMoney } from '../lib/api';
import {
  dismissRenumbered,
  removeOfflineOrder,
  retryOfflineOrder,
  tillLetter,
  useOfflineOrders,
  useOnline,
  useRenumbered,
  type OfflineItem,
} from '../lib/offline-till';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Jira GRW-716 — what the till is holding, said plainly and never in the way: an amber line over the till while it is
 * offline or has orders waiting ("Offline — 3 orders waiting to send"), and under it any order the server refused, with
 * its reason in the server's words and a Retry. Online with nothing waiting, it draws nothing at all.
 */
export function OfflineTillBar({
  branch,
  branches,
  onReprint,
}: {
  branch: string | null;
  branches: readonly string[];
  /** L2 — print the kitchen slip again, under the number the server gave the order. */
  onReprint?: (saleId: string) => void;
}) {
  const t = useTranslations('payFlow.offline');
  const online = useOnline();
  const held = useOfflineOrders().filter((i) => branches.includes(i.branch));
  const renamed = useRenumbered().filter((r) => branches.includes(r.branch));
  const [removing, setRemoving] = useState<OfflineItem | null>(null);
  const waiting = held.filter((i) => i.state === 'waiting').length;
  const failed = held.filter((i) => i.state === 'failed');
  if (online && waiting === 0 && failed.length === 0 && renamed.length === 0) return null;
  const canKeep = branch ? Boolean(tillLetter(branch)) : false;
  const line = !online
    ? waiting > 0
      ? t('offlineWaiting', { n: waiting })
      : canKeep
        ? t('offlineReady')
        : t('offlineCannot')
    : waiting > 0
      ? t('sending', { n: waiting })
      : null;
  return (
    <div className="otb" role="status" aria-live="polite">
      {line ? (
        <p className={`otb-line${online ? ' is-sending' : ''}`}>
          <svg className="otb-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path
              d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            {line}
            {/* L1 (owner, 2026-11-17) — these orders exist only in this browser until they are sent. */}
            {waiting > 0 ? <span className="otb-keep">{t('keepBrowser')}</span> : null}
          </span>
        </p>
      ) : null}
      {renamed.length > 0 ? (
        <ul className="otb-failed" aria-label={t('renumberedTitle')}>
          {renamed.map((r) => (
            <li key={r.id} className="otb-failed-row">
              <span className="otb-failed-what">{t('renumbered', { was: r.was, now: r.now })}</span>
              <span className="otb-actions">
                {onReprint ? (
                  <button type="button" className="btn btn-ghost otb-retry" disabled={!online} onClick={() => onReprint(r.saleId)}>
                    {t('printSlip')}
                  </button>
                ) : null}
                <button type="button" className="btn otb-retry" onClick={() => dismissRenumbered(r.id)}>
                  {t('ok')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {failed.length > 0 ? (
        <ul className="otb-failed" aria-label={t('failedTitle')}>
          {failed.map((i) => (
            <li key={i.id} className="otb-failed-row">
              <span className="otb-failed-what">
                <strong>{i.token}</strong> · {formatMoney(String(i.totalMinor))}
                <span className="otb-failed-why">{i.reason ?? t('failedUnknown')}</span>
              </span>
              <span className="otb-actions">
                <button type="button" className="btn btn-ghost otb-retry" disabled={!online} onClick={() => retryOfflineOrder(i.id, branches)}>
                  {online ? t('retry') : t('needsInternet')}
                </button>
                {/* L3 (owner, 2026-11-17) — a refusal Retry cannot change: take it off, and bill it again as it should be. */}
                <button type="button" className="btn btn-ghost otb-retry" onClick={() => setRemoving(i)}>
                  {t('remove')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={t('removeTitle', { token: removing.token })}
          body={t('removeBody', { amount: formatMoney(String(removing.totalMinor)) })}
          confirmLabel={t('removeGo')}
          cancelLabel={t('removeKeep')}
          tone="danger"
          onConfirm={() => {
            removeOfflineOrder(removing.id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </div>
  );
}
