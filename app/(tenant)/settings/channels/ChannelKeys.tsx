'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { ChannelCheckResult, ChannelConnection } from '../../lib/api-types';
import { keysState, mayEditKeys } from '../../lib/channel-keys-state';
import { ChannelStock } from './ChannelStock';
import { useWritable } from '../../components/SessionProvider';

/**
 * Jira GRW-621 — a marketplace's seller keys, under its "sells from" row.
 *
 * WRITE-ONLY, and the screen is built so it cannot be otherwise: the API never sends a value, so there is nothing here that could show
 * one. A saved field shows as "Saved"; replacing means typing every key again, because saving replaces the set. The state line says
 * whether the keys work, from what the marketplace said at the last Check — not from the fact that keys exist (`keysState`).
 *
 * Folded until wanted: two marketplaces with two or three full-width fields each would otherwise be the whole screen at 344px.
 *
 * Messages are held as WHAT HAPPENED, not as the sentence: a language switch re-renders without remounting, and a sentence stored in
 * state would stay in the old language.
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
type Problem = { id: 'fieldNeeded' | 'fieldRefused' | 'noBranch' | 'notSetUp' | 'failed' | 'checkNotConnected' | 'checkUnreadable' | 'checkChanged' | 'checkFailed'; field?: string };

/**
 * Keep a password manager out of it. `autocomplete="off"` is ignored for a password field, and a text field followed by a password field
 * reads as a login form: Chrome offers the Growza sign-in, one tap sends that password to the server as the marketplace's secret, and
 * the form closing after a save offers to remember it. `new-password` is the value browsers honour, and the data attributes are the
 * ones 1Password, LastPass and Bitwarden read.
 */
const NO_AUTOFILL = { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': 'true', 'data-form-type': 'other' } as const;

export function ChannelKeys({ channel, name }: { channel: Channel; name: string }) {
  const t = useTranslations('settingsChannels');
  const locale = useLocale();
  const writable = useWritable();
  const [conn, setConn] = useState<ChannelConnection | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'saving' | 'checking' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saved, setSaved] = useState(false);
  // The last Check's answer, kept for the words it carries — including "opens later", which is not stored anywhere.
  const [checked, setChecked] = useState<ChannelCheckResult['result'] | null>(null);
  const inFlight = useRef(false);
  /** Only the newest read may land: a reload that resolves after a Replace and Save would put the old status back over the new keys. */
  const readSeq = useRef(0);
  const firstField = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  /** `quiet`: a refresh of what is already on screen — a failed read keeps it, instead of turning the section into an error. */
  const load = useCallback(
    (quiet = false) => {
      const mine = ++readSeq.current;
      if (!quiet) setLoadFailed(false);
      api
        .channelKeys(channel)
        .then((c) => {
          if (mine === readSeq.current) setConn(c);
        })
        .catch(() => {
          if (mine === readSeq.current && !quiet) setLoadFailed(true);
        });
    },
    [channel],
  );
  useEffect(() => load(), [load]);

  // Focus follows the section: into the first field when the form opens, back to the button that opened it when it closes.
  useEffect(() => {
    if (open) firstField.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const label = (f: ChannelConnection['fields'][number]): string => {
    const known = KNOWN_FIELDS[f.key];
    return known ? t(known) : f.label;
  };
  const labelOf = (key: string | undefined): string => {
    const f = conn?.fields.find((x) => x.key === key);
    return f ? label(f) : (key ?? '');
  };

  const save = async () => {
    if (inFlight.current || !conn) return;
    const missing = conn.fields.find((f) => (values[f.key] ?? '').trim() === '');
    if (missing) {
      setProblem({ id: 'fieldNeeded', field: missing.key });
      return;
    }
    inFlight.current = true;
    setBusy('saving');
    setProblem(null);
    setSaved(false);
    try {
      const res = await api.saveChannelKeys(channel, Object.fromEntries(conn.fields.map((f) => [f.key, (values[f.key] ?? '').trim()])));
      // A reload that was already out would describe the OLD keys; this answer is newer.
      readSeq.current++;
      // The save answers with the keys only; the shop it sells from and the stock line are unchanged by it, and read again below.
      setConn({ ...res.connection, canCheck: conn.canCheck, branch: conn.branch, stock: conn.stock });
      load(true);
      setValues({});
      setOpen(false);
      setChecked(null);
      setSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        // The server has lost its encryption key since the page loaded: say so and stop offering a form that can only fail again.
        setConn({ ...conn, keysSetUp: false });
        setOpen(false);
        setProblem({ id: 'notSetUp' });
      } else if (e instanceof ApiError && e.code === 'no_branch') {
        // A business with more than one shop says which one sells here before there is anything to sell: the picker is the row above.
        setProblem({ id: 'noBranch' });
      } else if (e instanceof ApiError && e.status < 500) {
        // The values stay in the fields so a retry does not mean typing them again. The field the server objected to is named, in our words.
        setProblem({ id: 'fieldRefused', field: e.field?.replace(/^fields\./, '') });
      } else {
        setProblem({ id: 'failed' });
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('checking');
    setProblem(null);
    setSaved(false);
    try {
      const res = await api.checkChannelKeys(channel);
      setChecked(res.result);
      // What the marketplace said is stored; read it back so the state line and the time agree with it. Quietly: a failed read must not
      // take away the answer the owner just got.
      if (res.result !== 'unavailable') load(true);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'keys_not_set_up') {
        // The same fault, and the same answer, as saving: the server has no usable key.
        setConn((c) => (c ? { ...c, keysSetUp: false } : c));
        setProblem({ id: 'notSetUp' });
      } else {
        setProblem({
          id: code === 'not_connected' ? 'checkNotConnected' : code === 'keys_unreadable' ? 'checkUnreadable' : code === 'keys_changed' ? 'checkChanged' : 'checkFailed',
        });
        // Replaced while checking: what is on screen describes keys that are gone, so read it again.
        if (code === 'keys_changed') load(true);
      }
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
        <button type="button" className="btn btn-ghost stc-btn" onClick={() => load()}>
          {t('retry')}
        </button>
      </div>
    );
  }
  // The section's skeleton: the height it will have, so nothing jumps when the status arrives.
  if (!conn) return <div className="stc-keys stc-keys-loading" role="status" aria-busy="true" aria-label={t('loading')} />;

  const state = keysState(conn);
  const stateText = {
    notConnected: t('keysNotConnected'),
    saved: t('keysSaved'),
    working: t('keysWorking'),
    refused: t('keysRefused', { channel: name }),
    unreachableLast: t('keysUnreachableLast', { channel: name }),
  }[state.key];
  const last = conn.lastCheck;
  const when = last ? new Date(last.at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const mayEdit = mayEditKeys(conn, writable);

  const checkLine: Record<ChannelCheckResult['result'], string> = {
    working: t('keysCheckWorking', { channel: name }),
    rejected: t('keysCheckRejected', { channel: name }),
    unreachable: t('keysCheckUnreachable', { channel: name }),
    unavailable: t('keysCheckUnavailable', { channel: name }),
  };
  const problemText = (p: Problem): string => {
    switch (p.id) {
      case 'fieldNeeded':
        return t('keysFieldNeeded', { field: labelOf(p.field) });
      case 'fieldRefused':
        return p.field ? t('keysFieldRefused', { field: labelOf(p.field) }) : t('keysFailed');
      case 'noBranch':
        return t('keysNoBranch', { channel: name });
      case 'notSetUp':
        return t('keysNotSetUp');
      case 'checkNotConnected':
        return t('keysCheckNotConnected', { channel: name });
      case 'checkUnreadable':
        return t('keysCheckUnreadable', { channel: name });
      case 'checkChanged':
        return t('keysCheckChanged', { channel: name });
      case 'checkFailed':
        return t('keysCheckFailed');
      default:
        return t('keysFailed');
    }
  };
  // One live region, always mounted: a region that appears already holding its text is often not announced.
  const live = saved ? t('keysSavedNote') : checked ? checkLine[checked] : '';

  return (
    <div className="stc-keys">
      <div className="stc-keys-head">
        <span className="stc-keys-title">{t('keysTitle', { channel: name })}</span>
        <span className={`stc-state stc-state-${state.tone}`}>{stateText}</span>
      </div>
      {last?.ok ? <p className="stc-hint">{t('keysLastWorked', { when })}</p> : null}

      {open && mayEdit ? (
        <form
          className="stc-keys-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="stc-hint">{conn.saved ? t('keysReplaceHint') : t('keysIntro', { channel: name })}</p>
          {conn.fields.map((f, i) => (
            <div key={f.key} className="stc-field">
              <label className="stc-label" htmlFor={`stc-key-${channel}-${f.key}`}>
                {label(f)}
              </label>
              <input
                id={`stc-key-${channel}-${f.key}`}
                ref={i === 0 ? firstField : undefined}
                className="input stc-input"
                // Secrets are masked as they are typed; the id is not a secret. See NO_AUTOFILL for why `new-password`.
                type={f.secret ? 'password' : 'text'}
                autoComplete={f.secret ? 'new-password' : 'off'}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={values[f.key] ?? ''}
                // No placeholder: dots in an empty field look like something typed, and the owner then wonders why it says it is needed.
                aria-invalid={problem?.field === f.key ? true : undefined}
                aria-disabled={busy !== null}
                readOnly={busy !== null}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.key]: e.target.value }));
                  setProblem(null);
                }}
                {...NO_AUTOFILL}
              />
            </div>
          ))}
          <div className="stc-actions">
            {/* aria-disabled, not disabled: a disabled button gives up focus, and a keyboard user starts again from the top of the page. */}
            <button type="submit" className="btn stc-btn" aria-disabled={busy !== null} onClick={(e) => busy !== null && e.preventDefault()}>
              {busy === 'saving' ? t('keysSaving') : t('keysSave')}
            </button>
            <button
              type="button"
              className="btn btn-ghost stc-btn"
              aria-disabled={busy !== null}
              onClick={() => {
                if (busy !== null) return;
                setOpen(false);
                setValues({});
                setProblem(null);
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
                <span className="stc-set-name">{label(f)}</span>
                <span className="stc-set-state">
                  {f.set ? (
                    <>
                      {f.secret ? <span aria-hidden="true">•••••••• </span> : null}
                      {t('keysSet')}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!conn.keysSetUp ? <p className="stc-warn">{t('keysNotSetUp')}</p> : null}
          {writable ? (
            <div className="stc-actions">
              {mayEdit ? (
                <button ref={trigger} type="button" className="btn stc-btn" aria-disabled={busy !== null} onClick={() => busy === null && setOpen(true)}>
                  {conn.saved ? t('keysReplace') : t('keysAdd')}
                </button>
              ) : null}
              {conn.saved ? (
                <button type="button" className="btn btn-ghost stc-btn" aria-disabled={busy !== null} onClick={() => void check()}>
                  {busy === 'checking' ? t('keysChecking') : t('keysCheck')}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {!open ? <ChannelStock key={conn.channel} conn={conn} name={name} onChanged={() => load(true)} /> : null}

      <p className={`stc-live ${checked === 'working' || saved ? 'stc-note' : 'stc-hint'}`} role="status" aria-live="polite">
        {live}
      </p>
      {problem ? (
        <p className="stc-warn" role="alert">
          {problemText(problem)}
        </p>
      ) : null}
    </div>
  );
}
