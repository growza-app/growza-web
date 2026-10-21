'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '../../../lib/api';
import type { ChannelQueuePage } from '../../../lib/api-types';
import { mayTryAgain, queueHead, queueItemKey, queueReasonKey } from '../../../lib/channel-keys-state';
import { intlLocale } from '../../../lib/format';
import { Pagination } from '../../../components/Pagination';
import { useWritable } from '../../../components/SessionProvider';

const PAGE_SIZE = 10;
type Channel = 'flipkart' | 'amazon';

/**
 * Jira GRW-626 — one screen for "is the connection struggling, and what does it mean for my orders".
 *
 * Laid out at 344px: a headline that says the one thing that matters, a few counts, then a short list of what needs a person — each row a
 * sentence in plain words with its reason, never a status code on its own — and one Try again at the bottom, where a thumb is. What is merely
 * waiting its turn is counted and not listed: after a stock count thousands of sizes wait, which is normal, and would bury the ones that are not.
 * Rows stack; the list is paged on the server; a failed read keeps what was on screen and says so.
 */
export function QueueClient({ channel, timezone }: { channel: Channel; timezone: string }) {
  const t = useTranslations('settingsChannelQueue');
  const locale = useLocale();
  const writable = useWritable();
  const name = t(channel);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ChannelQueuePage | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sizes: number; messages: number } | null>(null);
  const [retryFailed, setRetryFailed] = useState(false);
  const seq = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.channelQueue(channel, page, PAGE_SIZE);
      if (mine !== seq.current) return;
      // A page that emptied under the person (the last row put right) steps back rather than showing nothing.
      if (res.items.length === 0 && res.total > 0 && page > 1) setPage(Math.max(1, Math.ceil(res.total / PAGE_SIZE)));
      else setData(res);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [channel, page]);
  useEffect(() => {
    void load();
  }, [load]);

  // Typed lookups, not `t(`reason.${x}`)`: the message keys are checked, and a key that does not exist cannot compile.
  const reasonWords: Record<string, string> = {
    not_listed: t('reason.not_listed'),
    invalid: t('reason.invalid'),
    order_cancelled: t('reason.order_cancelled'),
    order_unknown: t('reason.order_unknown'),
    not_allowed: t('reason.not_allowed'),
    other: t('reason.other'),
  };
  const when = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { timeZone: timezone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const again = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRetryFailed(false);
    try {
      setResult(await api.retryChannelQueue(channel));
      await load();
    } catch {
      setRetryFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (failed && data === null) {
    return (
      <div className="cq" role="alert">
        <p className="stc-warn">{t('loadError')}</p>
        <button type="button" className="btn stc-btn" onClick={() => void load()}>
          {t('retryLoad')}
        </button>
      </div>
    );
  }
  // The skeleton holds the height the screen will have, so nothing jumps when it arrives.
  if (data === null) return <div className="cq cq-loading" role="status" aria-busy="true" aria-label={t('loading')} />;

  const s = data.summary;
  const head = queueHead(s);
  const headText = {
    keysRejected: t('headKeysRejected', { channel: name }),
    needsAttention: t('headNeedsAttention', { channel: name, count: s.needsAttention }),
    holding: t('headHolding', { channel: name, when: s.holdUntil ? when(s.holdUntil) : '' }),
    waiting: t('headWaiting', { channel: name }),
    allClear: t('headAllClear'),
  }[head.key];

  return (
    <div className="cq" aria-busy={busy || undefined}>
      <p className={`cq-head cq-head-${head.tone}`} role="status">
        {headText}
      </p>

      <ul className="cq-counts" aria-label={t('countsLabel')}>
        <li>{t('countSizesWaiting', { channel: name, count: s.sizes.waiting })}</li>
        <li>{t('countMessagesWaiting', { channel: name, count: s.messages.waiting })}</li>
        {s.ordersIn.lastBroughtInAt ? <li>{t('countOrdersIn', { channel: name, when: when(s.ordersIn.lastBroughtInAt) })}</li> : null}
        {s.ordersIn.unreadable > 0 ? <li>{t('countUnreadable', { count: s.ordersIn.unreadable })}</li> : null}
      </ul>

      {s.keysRejected ? (
        <a className="btn stc-btn" href="/settings/channels">
          {t('replaceKeys')}
        </a>
      ) : null}

      {data.total === 0 ? (
        <p className="cq-empty" role="status">
          {t('nothing')}
        </p>
      ) : (
        <>
          <ul className="cq-list">
            {data.items.map((i) => {
              const key = queueItemKey(i);
              const why = reasonWords[queueReasonKey(i.reason)]!;
              const text = {
                sizeStuck: t('sizeStuck', { channel: name, label: i.label, why }),
                orderWaiting: t(i.kind === 'cancel' ? 'orderCancelWaiting' : 'orderWaiting', { channel: name, label: i.label }),
                orderStuck: t('orderStuck', { channel: name, label: i.label }),
                orderRefused: t(i.kind === 'cancel' ? 'orderCancelRefused' : 'orderRefused', { channel: name, label: i.label, why }),
              }[key];
              return (
                <li key={i.key} className="cq-row">
                  <span className="cq-row-text">{text}</span>
                  <span className="cq-row-since">{t('since', { when: when(i.since) })}</span>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={page}
            total={data.total}
            pageSize={PAGE_SIZE}
            noun={t('nounItems')}
            onChange={(p) => {
              // What a retry said belongs to the page it was on.
              setResult(null);
              setPage(p);
            }}
          />
        </>
      )}

      {failed ? (
        <p className="stc-warn" role="alert">
          {t('loadErrorKept')}
        </p>
      ) : null}

      {writable && mayTryAgain(s) ? (
        <div className="cq-actions">
          <button type="button" className="btn btn-primary stc-btn" aria-disabled={busy} onClick={() => !busy && void again()}>
            {busy ? t('retrying') : t('retry')}
          </button>
        </div>
      ) : null}
      <p className="stc-live stc-note" role="status" aria-live="polite">
        {result ? t('retried', { sizes: result.sizes, messages: result.messages }) : ''}
      </p>
      {retryFailed ? (
        <p className="stc-warn" role="alert">
          {t('retryFailed')}
        </p>
      ) : null}
    </div>
  );
}
