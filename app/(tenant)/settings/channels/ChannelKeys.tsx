'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { ChannelCheckResult, ChannelConnection } from '../../lib/api-types';
import { useWritable } from '../../components/SessionProvider';

/**
 * Jira GRW-621 — a marketplace's seller keys, under its "sells from" row.
 *
 * WRITE-ONLY, and the screen is built so it cannot be otherwise: the API never sends a value, so there is nothing here that could show
 * one. A saved field shows as dots and "Saved"; replacing means typing every key again, because saving replaces the set. The state
 * line says whether the keys work, from what the marketplace said at the last Check — not from the fact that keys exist.
 *
 * Folded until wanted: two marketplaces with two or three full-width fields each would otherwise be the whole screen at 344px.
 */

/** The fields this screen has words for in both languages. Any other the API declares shows under the seller panel's own English label. */
const KNOWN_FIELDS: Record<string, 'fieldApplicationId' | 'fieldApplicationSecret' | 'fieldClientId' | 'fieldClientSecret' | 'fieldRefreshToken'> = {
  applicationId: 'fieldApplicationId',
  applicationSecret: 'fieldApplicationSecret',
  clientId: 'fieldClientId',
  clientSecret: 'fieldClientSecret',
  refreshToken: 'fieldRefreshToken',
};

type Channel = ChannelConnection['channel'];

export function ChannelKeys({ channel, name }: { channel: Channel; name: string }) {
  const t = useTranslations('settingsChannels');
  const locale = useLocale();
  const writable = useWritable();
  const [conn, setConn] = useState<ChannelConnection | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'saving' | 'checking' | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // The last Check's answer, kept for the words it carries — including "opens later", which is not stored anywhere.
  const [checked, setChecked] = useState<ChannelCheckResult['result'] | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    api
      .channelKeys(channel)
      .then(setConn)
      .catch(() => setLoadFailed(true));
  }, [channel]);
  useEffect(load, [load]);

  const label = (f: ChannelConnection['fields'][number]): string => {
    const known = KNOWN_FIELDS[f.key];
    return known ? t(known) : f.label;
  };

  const save = async () => {
    if (inFlight.current || !conn) return;
    const missing = conn.fields.find((f) => (values[f.key] ?? '').trim() === '');
    if (missing) {
      setError(t('keysFieldNeeded', { field: label(missing) }));
      return;
    }
    inFlight.current = true;
    setBusy('saving');
    setError('');
    setNote('');
    try {
      const res = await api.saveChannelKeys(channel, Object.fromEntries(conn.fields.map((f) => [f.key, (values[f.key] ?? '').trim()])));
      setConn({ ...res.connection, canCheck: conn.canCheck });
      setValues({});
      setOpen(false);
      setChecked(null);
      setNote(t('keysSavedNote'));
    } catch (e) {
      // The values stay in the fields so a retry does not mean typing them again.
      setError(e instanceof ApiError && e.status === 503 ? t('keysNotSetUp') : e instanceof ApiError && e.status < 500 ? e.message : t('keysFailed'));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('checking');
    setError('');
    setNote('');
    try {
      const res = await api.checkChannelKeys(channel);
      setChecked(res.result);
      // What the marketplace said is stored; read it back so the state line and the time agree with it.
      if (res.result !== 'unavailable') load();
    } catch (e) {
      const code = e instanceof ApiError ? (e.code as string | undefined) : undefined;
      setError(code === 'not_connected' ? t('keysCheckNotConnected', { channel: name }) : code === 'keys_unreadable' ? t('keysCheckUnreadable', { channel: name }) : t('keysCheckFailed'));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  if (loadFailed) {
    return (
      <div className="stc-keys">
        <p className="stc-warn" role="alert">
          {t('loadError')}
        </p>
        <button type="button" className="btn btn-ghost stc-btn" onClick={load}>
          {t('retry')}
        </button>
      </div>
    );
  }
  // The section's skeleton: the height it will have, so nothing jumps when the status arrives.
  if (!conn) return <div className="stc-keys stc-keys-loading" aria-busy="true" aria-label={t('loading')} />;

  const last = conn.lastCheck;
  const state = !conn.saved
    ? t('keysNotConnected')
    : last?.ok
      ? t('keysWorking')
      : last
        ? last.reason === 'rejected'
          ? t('keysRefused', { channel: name })
          : t('keysUnreachableLast', { channel: name })
        : t('keysSaved');
  const tone = !conn.saved ? 'off' : last?.ok ? 'ok' : last ? 'bad' : 'idle';
  const when = last ? new Date(last.at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  const checkLine: Record<ChannelCheckResult['result'], string> = {
    working: t('keysCheckWorking', { channel: name }),
    rejected: t('keysCheckRejected', { channel: name }),
    unreachable: t('keysCheckUnreachable', { channel: name }),
    unavailable: t('keysCheckUnavailable', { channel: name }),
  };

  return (
    <div className="stc-keys">
      <div className="stc-keys-head">
        <span className="stc-keys-title">{t('keysTitle', { channel: name })}</span>
        <span className={`stc-state stc-state-${tone}`}>{state}</span>
      </div>
      {last?.ok ? <p className="stc-hint">{t('keysLastWorked', { when })}</p> : null}

      {!conn.keysSetUp ? (
        <p className="stc-warn" role="status">
          {t('keysNotSetUp')}
        </p>
      ) : open && writable ? (
        <form
          className="stc-keys-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="stc-hint">{conn.saved ? t('keysReplaceHint') : t('keysIntro', { channel: name })}</p>
          {conn.fields.map((f) => (
            <div key={f.key} className="stc-field">
              <label className="stc-label" htmlFor={`stc-key-${channel}-${f.key}`}>
                {label(f)}
              </label>
              <input
                id={`stc-key-${channel}-${f.key}`}
                className="input stc-input"
                // Secrets are masked as they are typed; the id is not a secret. Never autofilled, never spell-checked, never remembered.
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={values[f.key] ?? ''}
                placeholder={f.set ? '••••••••' : ''}
                disabled={busy !== null}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.key]: e.target.value }));
                  setError('');
                }}
              />
            </div>
          ))}
          <div className="stc-actions">
            <button type="submit" className="btn stc-btn" disabled={busy !== null}>
              {busy === 'saving' ? t('keysSaving') : t('keysSave')}
            </button>
            <button
              type="button"
              className="btn btn-ghost stc-btn"
              disabled={busy !== null}
              onClick={() => {
                setOpen(false);
                setValues({});
                setError('');
              }}
            >
              {t('keysCancel')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <ul className="stc-set" aria-label={t('keysTitle', { channel: name })}>
            {conn.fields.map((f) => (
              <li key={f.key} className="stc-set-row">
                <span>{label(f)}</span>
                <span className="stc-set-state">{f.set ? `${f.secret ? '••••••••  ' : ''}${t('keysSet')}` : '—'}</span>
              </li>
            ))}
          </ul>
          {writable ? (
            <div className="stc-actions">
              <button type="button" className="btn stc-btn" disabled={busy !== null} onClick={() => setOpen(true)}>
                {conn.saved ? t('keysReplace') : t('keysAdd')}
              </button>
              {conn.saved ? (
                <button type="button" className="btn btn-ghost stc-btn" disabled={busy !== null} onClick={() => void check()}>
                  {busy === 'checking' ? t('keysChecking') : t('keysCheck')}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {checked ? (
        <p className={checked === 'working' ? 'stc-note' : 'stc-hint'} role="status">
          {checkLine[checked]}
        </p>
      ) : null}
      {note ? (
        <p className="stc-note" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="stc-warn" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
