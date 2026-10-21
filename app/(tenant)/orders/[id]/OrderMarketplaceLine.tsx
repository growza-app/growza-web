'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '../../lib/api';
import type { OrderMarketplaceMessage } from '../../lib/api-types';
import { tellLines } from '../../lib/channel-keys-state';
import { intlLocale } from '../../lib/format';

/**
 * Jira GRW-625 — what the marketplace was told about this order: "Flipkart told at 10:12", or "Flipkart not told yet" with a way to ask again.
 *
 * One quiet line per message, under the state. Nothing modal, nothing alarming for a thirty-second delay: "not told yet" is the ordinary
 * word for a message that is queued, and only a message that was REFUSED or could not be sent after repeated tries is drawn as a problem.
 * The state the shop sees is the shop's own; the marketplace's answer sits beside it, never instead of it.
 */
export function OrderMarketplaceLine({
  orderId,
  channel,
  messages,
  canRetry,
  timezone,
  onChanged,
}: {
  orderId: string;
  /** The marketplace's name in the reader's language ("Flipkart"). */
  channel: string;
  messages: readonly OrderMarketplaceMessage[] | undefined;
  canRetry: boolean;
  timezone: string;
  onChanged: () => void;
}) {
  const t = useTranslations('orders');
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const lines = tellLines(messages);
  if (lines.length === 0) return null;
  const when = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { timeZone: timezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const again = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await api.tellMarketplaceAgain(orderId);
      onChanged();
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="ord-tell" aria-label={t('tell.title')}>
      {lines.map((l) => {
        const what = l.kind === 'dispatch' ? 'sent' : 'cancelled';
        const text = {
          accepted: t(`tell.${what}Accepted`, { channel, when: l.at ? when(l.at) : '' }),
          pending: t(`tell.${what}Pending`, { channel }),
          stuck: t('tell.stuck', { channel }),
          refused: t(`tell.refused.${l.reason ?? 'other'}`, { channel }),
        }[l.key];
        return (
          <p key={l.kind} className={`ord-tell-row ord-tell-${l.tone}`}>
            <span>{text}</span>
            {l.retry && canRetry ? (
              <button type="button" className="btn btn-ghost ord-tell-btn" aria-disabled={busy} onClick={() => !busy && void again()}>
                {busy ? t('tell.retrying') : t('tell.retry')}
              </button>
            ) : null}
          </p>
        );
      })}
      <p className="ord-tell-live" role="status" aria-live="polite">
        {busy ? t('tell.retrying') : ''}
      </p>
      {failed ? (
        <p className="ord-tell-row ord-tell-bad" role="alert">
          {t('tell.retryFailed')}
        </p>
      ) : null}
    </section>
  );
}
