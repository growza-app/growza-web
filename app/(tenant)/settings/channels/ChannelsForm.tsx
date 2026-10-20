'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { ChannelBranch, ChannelBranches } from '../../lib/api-types';
import { useWritable } from '../../components/SessionProvider';

/**
 * Jira GRW-641 — one row per marketplace: "Flipkart sells from [shop]".
 *
 * A one-branch shop sees its shop and a line saying it cannot be changed — never a question. With several, a full-width 44px picker per
 * marketplace, saved the moment it is chosen; the answer says what changed and how many online orders are still to be sent from the old
 * shop (they stay there: history is not re-pointed). A shop that was chosen and has since closed is said plainly, with the picker open.
 */
export function ChannelsForm({ initial }: { initial: ChannelBranches }) {
  const t = useTranslations('settingsChannels');
  const writable = useWritable();
  const [data, setData] = useState(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const word = (c: ChannelBranch['channel']): string => (c === 'flipkart' ? t('flipkart') : t('amazon'));

  const choose = async (row: ChannelBranch, locationId: string) => {
    if (inFlight.current || locationId === '' || locationId === row.locationId) return;
    inFlight.current = true;
    setBusy(row.channel);
    setErrors((e) => ({ ...e, [row.channel]: '' }));
    setNotes((n) => ({ ...n, [row.channel]: '' }));
    try {
      const res = await api.setChannelBranch(row.channel, locationId);
      setData((d) => ({ ...d, channels: d.channels.map((c) => (c.channel === row.channel ? { ...c, locationId: res.locationId, branchName: res.branchName, source: 'chosen', gone: false } : c)) }));
      const saved = res.changed ? t('saved', { channel: word(row.channel), branch: res.branchName }) : t('unchanged', { channel: word(row.channel), branch: res.branchName });
      const left = res.inFlightAtOld > 0 && res.previous.branchName ? ` ${t('inFlight', { count: res.inFlightAtOld, branch: res.previous.branchName })}` : '';
      setNotes((n) => ({ ...n, [row.channel]: saved + left }));
    } catch (e) {
      setErrors((x) => ({ ...x, [row.channel]: e instanceof ApiError && e.status < 500 ? e.message : t('failed') }));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  return (
    <section className="stc" aria-label={t('title')}>
      <p className="stc-hint">{t('intro')}</p>
      <ul className="stc-list">
        {data.channels.map((row) => (
          <li key={row.channel} className="stc-row">
            <label className="stc-label" htmlFor={`stc-${row.channel}`}>
              {t('sellsFrom', { channel: word(row.channel) })}
            </label>
            {row.changeable && writable ? (
              <select id={`stc-${row.channel}`} className="input stc-select" value={row.locationId ?? ''} disabled={busy !== null} onChange={(e) => void choose(row, e.target.value)}>
                {row.locationId === null ? <option value="">{t('choose')}</option> : null}
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="stc-fixed">{row.branchName ?? '—'}</p>
            )}
            <p className="stc-hint">{row.changeable ? t('explain') : t('single')}</p>
            {row.gone ? (
              <p className="stc-warn" role="alert">
                {t('gone', { channel: word(row.channel), branch: row.branchName ?? '' })}
              </p>
            ) : null}
            {notes[row.channel] ? (
              <p className="stc-note" role="status">
                {notes[row.channel]}
              </p>
            ) : null}
            {errors[row.channel] ? (
              <p className="stc-warn" role="alert">
                {errors[row.channel]}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
