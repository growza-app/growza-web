'use client';

import { useTranslations } from 'next-intl';
import { formatMoney } from '../lib/api';
import { retryOfflineOrder, tillLetter, useOfflineOrders, useOnline } from '../lib/offline-till';

/**
 * Jira GRW-716 — what the till is holding, said plainly and never in the way: an amber line over the till while it is
 * offline or has orders waiting ("Offline — 3 orders waiting to send"), and under it any order the server refused, with
 * its reason in the server's words and a Retry. Online with nothing waiting, it draws nothing at all.
 */
export function OfflineTillBar({ branch, branches }: { branch: string | null; branches: readonly string[] }) {
  const t = useTranslations('payFlow.offline');
  const online = useOnline();
  const held = useOfflineOrders().filter((i) => branches.includes(i.branch));
  const waiting = held.filter((i) => i.state === 'waiting').length;
  const failed = held.filter((i) => i.state === 'failed');
  if (online && waiting === 0 && failed.length === 0) return null;
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
          <span>{line}</span>
        </p>
      ) : null}
      {failed.length > 0 ? (
        <ul className="otb-failed" aria-label={t('failedTitle')}>
          {failed.map((i) => (
            <li key={i.id} className="otb-failed-row">
              <span className="otb-failed-what">
                <strong>{i.token}</strong> · {formatMoney(String(i.totalMinor))}
                <span className="otb-failed-why">{i.reason ?? t('failedUnknown')}</span>
              </span>
              <button type="button" className="btn btn-ghost otb-retry" disabled={!online} onClick={() => retryOfflineOrder(i.id, branches)}>
                {online ? t('retry') : t('needsInternet')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
