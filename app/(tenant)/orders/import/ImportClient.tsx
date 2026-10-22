'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { ImportSummary } from '../../lib/api-types';
import AppLink from '../../../shared/AppLink';
import { newRequestId } from '../../sales/sales-helpers';
import { useWritable } from '../../components/SessionProvider';

type Channel = 'flipkart' | 'amazon';
const SHOWN = 20;

/**
 * Jira GRW-619 — import the order report downloaded from a seller panel.
 *
 * One screen, in the order a person does it: which marketplace, then the file (or its rows pasted), then Import. The marketplace
 * is CHOSEN and never guessed from the file — nothing can be imported until it is. The answer is three plain numbers and, where
 * something needs the owner, what: the rows that could not be read, and the codes that are holding orders back, each with where to
 * fix it. Uploading the same report twice is safe and says so ("already in Growza"): the server keys every line by the marketplace's
 * own id, so nothing here has to prevent a second upload, only to say what happened.
 *
 * Laid out at 344px: a column, the summary a short list (never a table that scrolls sideways), the primary action at the bottom.
 */
export function ImportClient() {
  const t = useTranslations('orders.import');
  const writable = useWritable();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  // One request id for as long as the choice is the same: a retry after a lost answer is the same upload, not a second.
  const request = useRef<{ id: string; signature: string } | null>(null);
  const inFlight = useRef(false);

  const channelWord = channel === 'flipkart' ? t('flipkart') : channel === 'amazon' ? t('amazon') : '';
  const ready = channel !== null && !busy && (mode === 'file' ? file !== null : text.trim() !== '');

  const run = async () => {
    if (!channel || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSummary(null);
    const signature = JSON.stringify({ channel, mode, file: file ? [file.name, file.size, file.lastModified] : null, text: mode === 'paste' ? text : null });
    if (request.current?.signature !== signature) request.current = { id: `import-${newRequestId()}`, signature };
    try {
      setSummary(mode === 'file' && file ? await api.importOrdersFile(channel, file, request.current.id) : await api.importOrdersText(channel, text, request.current.id));
      request.current = null;
    } catch (e) {
      // The server's own sentence says what a file was missing, or that the marketplace was not chosen; a fault says nothing of its own.
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('failed'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="imp">
      <section className="imp-step" aria-label={t('stepChannel')}>
        <h2>{t('stepChannel')}</h2>
        <div className="pf-chips" role="group" aria-label={t('stepChannel')}>
          {(['flipkart', 'amazon'] as const).map((c) => (
            <button key={c} type="button" className={`pf-chip ${channel === c ? 'pf-chip-on' : ''}`} aria-pressed={channel === c} disabled={busy} onClick={() => setChannel(c)}>
              {c === 'flipkart' ? t('flipkart') : t('amazon')}
            </button>
          ))}
        </div>
        <p className="imp-hint">{channel === null ? t('chooseFirst') : channel === 'flipkart' ? t('whereFlipkart') : t('whereAmazon')}</p>
      </section>

      <section className="imp-step" aria-label={t('stepReport')}>
        <h2>{t('stepReport')}</h2>
        <div className="pf-chips" role="group" aria-label={t('stepReport')}>
          <button type="button" className={`pf-chip ${mode === 'file' ? 'pf-chip-on' : ''}`} aria-pressed={mode === 'file'} disabled={busy} onClick={() => setMode('file')}>
            {t('modeFile')}
          </button>
          <button type="button" className={`pf-chip ${mode === 'paste' ? 'pf-chip-on' : ''}`} aria-pressed={mode === 'paste'} disabled={busy} onClick={() => setMode('paste')}>
            {t('modePaste')}
          </button>
        </div>
        {mode === 'file' ? (
          <label className="imp-file">
            <span className="imp-hint">{file ? file.name : channel === null ? t('dropHereAny') : t('dropHere', { channel: channelWord })}</span>
            <input type="file" accept=".csv,.tsv,.txt,.xlsx" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <textarea className="input imp-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} placeholder={t('pastePlaceholder')} aria-label={t('modePaste')} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        )}
      </section>

      {error ? (
        <p className="imp-error" role="alert">
          {error}
        </p>
      ) : null}

      {busy ? (
        <p className="imp-hint" role="status" aria-live="polite">
          {t('working')}
        </p>
      ) : null}

      {summary ? <Summary summary={summary} /> : null}

      {writable ? (
        <div className="imp-bar">
          <button type="button" className="btn btn-primary imp-go" disabled={!ready} onClick={() => void run()}>
            {channel === null ? t('chooseFirstButton') : t('go', { channel: channelWord })}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ summary }: { summary: ImportSummary }) {
  const t = useTranslations('orders.import');
  const nothing = summary.created === 0 && summary.alreadyThere === 0 && summary.held === 0;
  return (
    <section className="imp-summary" aria-label={t('summaryTitle')} role="status">
      <h2>{t('summaryTitle')}</h2>
      {nothing && summary.problems.length > 0 ? <p>{t('nothingRead')}</p> : null}
      <ul className="imp-counts">
        <li>
          <span className="imp-n">{summary.created}</span>
          <span>{t('created', { count: summary.created })}</span>
        </li>
        <li>
          <span className="imp-n">{summary.alreadyThere}</span>
          <span>{t('alreadyThere')}</span>
        </li>
        <li>
          <span className="imp-n">{summary.held}</span>
          <span>{t('held', { count: summary.held })}</span>
        </li>
      </ul>
      {summary.replayed ? <p className="imp-hint">{t('replayed')}</p> : null}
      {summary.shortUnits > 0 ? <p className="imp-warn">{t('short', { count: summary.shortUnits })}</p> : null}

      {summary.heldCodes.length > 0 ? (
        <div className="imp-block">
          <h3>{t('heldTitle')}</h3>
          <p className="imp-hint">{t('heldHint')}</p>
          <ul className="imp-list">
            {summary.heldCodes.slice(0, SHOWN).map((h) => (
              <li key={h.code}>
                <span className="imp-code">{h.code}</span>
                <span className="imp-hint">{h.reason === 'retired' ? t('heldRetired', { count: h.lines }) : t('heldLines', { count: h.lines })}</span>
              </li>
            ))}
          </ul>
          {summary.heldCodes.length > SHOWN ? <p className="imp-hint">{t('moreCodes', { count: summary.heldCodes.length - SHOWN })}</p> : null}
          <AppLink className="btn" href="/orders/held">
            {t('fixHeld')}
          </AppLink>
        </div>
      ) : null}

      {summary.problems.length > 0 ? (
        <div className="imp-block">
          <h3>{t('problemsTitle')}</h3>
          <ul className="imp-list">
            {summary.problems.slice(0, SHOWN).map((p) => (
              <li key={p.row}>
                <span className="imp-code">{t('row', { row: p.row })}</span>
                <span className="imp-hint">{p.why}</span>
              </li>
            ))}
          </ul>
          {summary.problems.length > SHOWN ? <p className="imp-hint">{t('more', { count: summary.problems.length - SHOWN })}</p> : null}
        </div>
      ) : null}

      <AppLink className="btn" href="/orders">
        {t('seeOrders')}
      </AppLink>
    </section>
  );
}
