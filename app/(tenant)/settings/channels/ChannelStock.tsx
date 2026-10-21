'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { ChannelConnection } from '../../lib/api-types';
import { parseBuffer, stockLine } from '../../lib/channel-keys-state';
import { useWritable } from '../../components/SessionProvider';

/**
 * Jira GRW-624 — what is sent to a marketplace about stock: when it last went, whether anything is stuck, and how many of each size to
 * keep back from online orders.
 *
 * Counts and times only. The server never sends a number per size, so there is nothing here that could list them; the owner sees the
 * one thing they can act on, which is the buffer.
 */
export function ChannelStock({ conn, name, onChanged }: { conn: ChannelConnection; name: string; onChanged: () => void }) {
  const t = useTranslations('settingsChannels');
  const locale = useLocale();
  const writable = useWritable();
  const [draft, setDraft] = useState(String(conn.stock.buffer));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'invalid' | 'failed' | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);

  const line = stockLine(conn);
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const primary = line.primary;
  const primaryText = !primary
    ? ''
    : {
        notYet: t('stockNotYet', { channel: name }),
        refused: t('stockRefused', { channel: name }),
        unreadable: t('stockUnreadable', { channel: name }),
        slow: t('stockSlow', { channel: name }),
        unreachable: t('stockUnreachable', { channel: name }),
        updated: t('stockUpdated', { channel: name, when: primary.at ? when(primary.at) : '' }),
        waiting: t('stockWaiting', { channel: name, count: primary.count ?? 0 }),
        nothing: t('stockNone', { channel: name }),
      }[primary.key];

  const changed = draft.trim() !== String(conn.stock.buffer);

  const save = async () => {
    if (inFlight.current) return;
    const n = parseBuffer(draft);
    if (n === null) {
      setProblem('invalid');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      await api.setStockBuffer(conn.channel, n);
      setSaved(true);
      onChanged();
    } catch (e) {
      setProblem(e instanceof ApiError && e.status < 500 ? 'invalid' : 'failed');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="stc-stock">
      <div className="stc-keys-head">
        <span className="stc-keys-title">{t('stockTitle')}</span>
      </div>
      {primary ? <p className={primary.tone === 'bad' ? 'stc-warn' : primary.tone === 'ok' ? 'stc-note' : 'stc-hint'}>{primaryText}</p> : null}
      {line.stuck > 0 ? <p className="stc-warn">{t('stockStuck', { channel: name, count: line.stuck })}</p> : null}

      {writable ? (
        <form
          className="stc-field"
          // Our own check and our own words (in either language): a native bubble is English only and says "match the format requested".
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="stc-label" htmlFor={`stc-buffer-${conn.channel}`}>
            {t('bufferLabel')}
          </label>
          <input
            id={`stc-buffer-${conn.channel}`}
            className="input stc-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft}
            aria-invalid={problem === 'invalid' ? true : undefined}
            aria-describedby={`stc-buffer-hint-${conn.channel}`}
            readOnly={busy}
            onChange={(e) => {
              setDraft(e.target.value);
              setProblem(null);
              setSaved(false);
            }}
          />
          <p className="stc-hint" id={`stc-buffer-hint-${conn.channel}`}>
            {t('bufferHint')}
          </p>
          {changed ? (
            <div className="stc-actions">
              <button type="submit" className="btn stc-btn" aria-disabled={busy} onClick={(e) => busy && e.preventDefault()}>
                {busy ? t('bufferSaving') : t('bufferSave')}
              </button>
            </div>
          ) : null}
        </form>
      ) : (
        <p className="stc-hint">{t('bufferReadOnly', { count: conn.stock.buffer })}</p>
      )}

      <p className={`stc-live ${saved ? 'stc-note' : 'stc-hint'}`} role="status" aria-live="polite">
        {saved ? t('bufferSaved', { channel: name }) : ''}
      </p>
      {problem ? (
        <p className="stc-warn" role="alert">
          {problem === 'invalid' ? t('bufferInvalid') : t('bufferFailed')}
        </p>
      ) : null}
    </div>
  );
}
