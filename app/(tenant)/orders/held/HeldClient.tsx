'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError } from '../../lib/api';
import type { HeldCode, HeldPage, SizeToMap } from '../../lib/api-types';
import { autoFocusField } from '../../../shared/a11y/soft-keyboard';
import { Pagination } from '../../components/Pagination';
import { SearchClear } from '../../components/SearchClear';
import { useWritable } from '../../components/SessionProvider';
import { intlLocale } from '../../lib/format';

type Channel = 'flipkart' | 'amazon';
const PAGE_SIZE = 10;

/**
 * Jira GRW-620 — what did not match: a worklist, not a report.
 *
 * One row per CODE (grouped on the server — a hundred held codes across a thousand lines is a page of ten rows, never a thousand sent
 * to a phone), most-waited-on first. Each row says what the report called it, how many items in how many orders are waiting, and has
 * its one action RIGHT THERE: match it to a size (search the shelf by name, tap the size), or dismiss it with a reason. Mapping releases
 * the orders waiting on the code; the answer says how many became real orders. Nothing here guesses a mapping from the product's name:
 * the owner taps the size.
 *
 * Laid out at 344px: every row stacks — code, what it was called, how many are waiting, the action — the actions a thumb tall.
 */
export function HeldClient({ timezone }: { timezone: string }) {
  const t = useTranslations('orders.held');
  const writable = useWritable();
  const [channel, setChannel] = useState<Channel | ''>('');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HeldPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);
  // A fix finishes by reloading the list the person is looking at NOW, not the one the render that started it was looking at.
  const loadNow = useRef<() => Promise<void>>(async () => undefined);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setFailed(false);
    try {
      const res = await api.heldCodes({ channel: channel || undefined, q, page, pageSize: PAGE_SIZE });
      if (mine !== seq.current) return;
      // A page that emptied under the person (the last row fixed) steps back rather than showing nothing.
      if (res.rows.length === 0 && res.total > 0 && page > 1) setPage(Math.max(1, Math.ceil(res.total / PAGE_SIZE)));
      else setData(res);
    } catch {
      if (mine === seq.current) setFailed(true);
    }
  }, [channel, q, page]);
  loadNow.current = load;
  useEffect(() => {
    void load();
  }, [load]);
  // Typing searches after a short pause, on the server; the first page of the new search.
  useEffect(() => {
    const id = setTimeout(() => {
      if (typed.trim() !== q) {
        setQ(typed.trim());
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [typed, q]);

  const fixed = async (message: string) => {
    setNote(message);
    await loadNow.current();
  };

  return (
    <div className="held">
      <label className="search-wrap held-search">
        <input
          type="search"
          className="search-input search-input-bare"
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <SearchClear value={typed} onClear={() => setTyped('')} />
      </label>
      <div className="pf-chips" role="group" aria-label={t('channelGroup')}>
        {(['', 'flipkart', 'amazon'] as const).map((c) => (
          <button
            key={c || 'all'}
            type="button"
            className={`pf-chip ${channel === c ? 'pf-chip-on' : ''}`}
            aria-pressed={channel === c}
            onClick={() => {
              if (c === channel) return;
              setChannel(c);
              setPage(1);
              setData(null);
            }}
          >
            {c === '' ? t('all') : c === 'flipkart' ? t('flipkart') : t('amazon')}
          </button>
        ))}
      </div>

      {note ? (
        <p className="held-note" role="status">
          {note}
        </p>
      ) : null}

      {failed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : data === null ? (
        <ul className="held-list" aria-busy="true" aria-label={t('loading')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="held-row held-skeleton" />
          ))}
        </ul>
      ) : data.total === 0 ? (
        <div className="held-empty" role="status">
          <p className="held-empty-title">{q || channel ? t('noMatch') : t('nothing')}</p>
          {q || channel ? null : <p className="held-hint">{t('nothingHint')}</p>}
        </div>
      ) : (
        <>
          <p className="held-headline" role="status">
            {q ? t('headlineSearch', { codes: data.total }) : t('headline', { orders: data.orders, codes: data.total })}
          </p>
          <ul className="held-list">
            {data.rows.map((row) => (
              <Row key={`${row.channel}:${row.code}`} row={row} writable={writable} timezone={timezone} onFixed={fixed} />
            ))}
          </ul>
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} noun={t('nounCodes')} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function Row({ row, writable, timezone, onFixed }: { row: HeldCode; writable: boolean; timezone: string; onFixed: (message: string) => Promise<void> }) {
  const t = useTranslations('orders.held');
  const locale = useLocale();
  const day = (iso: string): string => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone }).format(new Date(iso));
  const [open, setOpen] = useState<'match' | 'dismiss' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const [choices, setChoices] = useState<SizeToMap[] | null>(null);
  const [findFailed, setFindFailed] = useState(false);
  const [findTick, setFindTick] = useState(0);
  const [reason, setReason] = useState('');
  const inFlight = useRef(false);
  const lookup = useRef(0);

  const channelWord = row.channel === 'flipkart' ? t('flipkart') : t('amazon');
  const say = (e: unknown): string => (e instanceof ApiError && e.status < 500 ? e.message : t('failed'));

  // Searching the shelf by name happens on the server, after a pause; the newest answer wins.
  useEffect(() => {
    if (open !== 'match' || find.trim().length < 2) {
      setChoices(null);
      setFindFailed(false);
      return;
    }
    setFindFailed(false);
    const mine = ++lookup.current;
    const id = setTimeout(() => {
      api
        .sizesToMap(row.channel, find.trim())
        .then((res) => mine === lookup.current && setChoices(res.rows))
        // A failed search is not "no size matches": say it failed, and let the person try again.
        .catch(() => mine === lookup.current && setFindFailed(true));
    }, 250);
    return () => clearTimeout(id);
  }, [find, open, row.channel, findTick]);

  const run = async (work: () => Promise<string>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await onFixed(await work());
    } catch (e) {
      setError(say(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const released = (n: number, still: number): string =>
    n > 0 ? t('releasedNote', { orders: n, code: row.code }) : still > 0 ? t('stillNote', { code: row.code }) : t('mappedNote', { code: row.code });

  const match = (size: SizeToMap) =>
    run(async () => {
      try {
        const res = await api.saveMarketplaceCodes({
          channel: row.channel,
          rows: [size.variantId ? { code: row.code, variantId: size.variantId } : { code: row.code, productId: size.productId }],
          replace: row.reason === 'retired' ? true : undefined,
        });
        return released(res.released?.orders ?? 0, res.released?.stillHeld ?? 0);
      } catch (e) {
        // Already mapped by someone else meanwhile: the server released the waiting orders against THAT mapping; say so, naming the size.
        // Only a refusal that names the size it points at (and released against it): a race refusal carries neither and keeps the server's own words.
        if (e instanceof ApiError && e.code === 'code_taken' && typeof (e.body as { takenBy?: unknown } | undefined)?.takenBy === 'string') {
          const body = e.body as { released?: { orders?: number } } | undefined;
          return t('takenNote', { code: row.code, size: (e.body as { takenBy?: string } | undefined)?.takenBy ?? '', orders: body?.released?.orders ?? 0 });
        }
        throw e;
      }
    });

  const release = () =>
    run(async () => {
      const res = await api.releaseHeld(row.channel, [row.code]);
      return released(res.orders, res.stillHeld);
    });

  const dismiss = () =>
    run(async () => {
      const res = await api.dismissHeld(row.channel, row.code, reason);
      return t('dismissedNote', { code: row.code, count: res.dismissedLines });
    });

  return (
    <li className="held-row">
      <div className="held-code">
        <span className="held-code-text">{row.code}</span>
        <span className="held-channel">{channelWord}</span>
      </div>
      {row.nameInReport ? <p className="held-name">{row.nameInReport}</p> : null}
      <p className="held-hint">{t('waiting', { items: row.lines, orders: row.orders })}</p>
      <p className="held-hint">{row.fileName ? t('fromFile', { file: row.fileName, when: day(row.since) }) : t('since', { when: day(row.since) })}</p>
      {row.reason === 'retired' ? <p className="held-warn">{t('retired', { size: row.mappedTo ?? '' })}</p> : null}
      {row.reason === 'ready' ? <p className="held-hint">{t('ready', { size: row.mappedTo ?? '' })}</p> : null}

      {writable ? (
        <div className="held-actions">
          {row.reason === 'ready' ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void release()}>
              {t('releaseNow')}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" aria-expanded={open === 'match'} disabled={busy} onClick={() => setOpen(open === 'match' ? null : 'match')}>
              {t('matchToSize')}
            </button>
          )}
          <button type="button" className="btn" aria-expanded={open === 'dismiss'} disabled={busy} onClick={() => setOpen(open === 'dismiss' ? null : 'dismiss')}>
            {t('dismiss')}
          </button>
        </div>
      ) : null}

      {open === 'match' ? (
        <div className="held-pick">
          <input
            className="input held-input"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder={t('findPlaceholder')}
            aria-label={t('findLabel', { code: row.code })}
            autoFocus={autoFocusField()}
            autoComplete="off"
          />
          {findFailed ? (
            <p className="held-warn" role="alert">
              {t('findFailed')}{' '}
              <button type="button" className="btn" onClick={() => setFindTick((n) => n + 1)}>
                {t('retry')}
              </button>
            </p>
          ) : choices === null ? (
            <p className="held-hint">{find.trim().length < 2 ? t('findHint') : t('searching')}</p>
          ) : choices.length === 0 ? (
            <p className="held-hint">{t('noSizes')}</p>
          ) : null}
          {choices && choices.length > 0 ? (
            <ul className="held-choices">
              {choices.map((s) => (
                <li key={`${s.productId}:${s.variantId ?? ''}`}>
                  <button type="button" className="held-choice" disabled={busy} onClick={() => void match(s)}>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {open === 'dismiss' ? (
        <div className="held-pick">
          <p className="held-hint">{t('dismissHint', { count: row.lines })}</p>
          <textarea
            className="input held-input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('reasonPlaceholder')}
            aria-label={t('reasonLabel')}
            maxLength={240}
          />
          <button type="button" className="btn btn-primary" disabled={busy || reason.trim() === ''} onClick={() => void dismiss()}>
            {t('dismissConfirm')}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="held-warn" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
