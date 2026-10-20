'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '../../../lib/api';
import type { MarketplaceCode, ProductSizes } from '../../../lib/api-types';
import { sizeLabel } from '../../../lib/till-sizes';
import { useWritable } from '../../../components/SessionProvider';
import { arrange, CHANNELS, parsePaste, unmappedCount, type Channel } from './codes-model';

/**
 * Jira GRW-618 — one product's marketplace codes, size by size.
 *
 * Laid out at 344px: the channel, one line saying how many sizes still have no code, then a card per size with its codes as
 * chips (each removable) and a field to add one. The unmapped sizes are the ones that say "No code yet" — obvious without a
 * filter. For the thousands there will be, "Paste many" takes "code, size" lines for this product in ONE request: all of it
 * or none, and a refusal names the line and the code.
 *
 * Nothing here decides what is valid. The server holds one code per channel, one size per code, and the branch; this only
 * shows what it answers — including which size a taken code already points at, with a way to move it deliberately.
 */
export function CodesScreen({ sizes }: { sizes: ProductSizes }) {
  const t = useTranslations('products.codes');
  const writable = useWritable();
  const productId = sizes.product.id;
  const sized = sizes.axes.length > 0;

  const [channel, setChannel] = useState<Channel>('flipkart');
  // What the screen is on RIGHT NOW: a save that finishes after a switch must not reload, or draw, the channel the person left.
  const channelNow = useRef<Channel>('flipkart');
  channelNow.current = channel;
  const [codes, setCodes] = useState<MarketplaceCode[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ key: string; text: string; movable?: { code: string; variantId: string | null } } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteDone, setPasteDone] = useState<string | null>(null);
  const inFlight = useRef(false);
  // The newest channel asked for wins: a slow answer for the one the person has left must not draw over the one they are on.
  const loadSeq = useRef(0);

  // `fresh`: a first load or a channel switch empties the list for its skeleton; a reload after a save keeps what is on screen (and
  // the scroll position and the focus with it) until the new list arrives.
  const load = useCallback(
    async (ch: Channel, fresh = true) => {
      const seq = ++loadSeq.current;
      setLoadFailed(false);
      if (fresh) setCodes(null);
      try {
        let page = 1;
        const all: MarketplaceCode[] = [];
        for (;;) {
          const res = await api.marketplaceCodes({ channel: ch, productId, page });
          all.push(...res.rows);
          if (all.length >= res.total || res.rows.length === 0) break;
          page += 1;
        }
        if (seq === loadSeq.current) setCodes(all);
      } catch {
        if (seq === loadSeq.current) setLoadFailed(true);
      }
    },
    [productId],
  );
  useEffect(() => {
    // A switch starts clean: the last channel's refusal, its typed codes and its paste are not this channel's.
    setProblem(null);
    setNotice(null);
    setDraft({});
    setPasteError(null);
    setPasteDone(null);
    void load(channel);
  }, [load, channel]);
  /** Reload after a write — only if the person is still on the channel the write was for. */
  const reload = async (ch: Channel) => {
    if (channelNow.current === ch) await load(ch, false);
  };

  const rows = useMemo(() => {
    if (codes === null) return null;
    if (sized) return arrange(sizes.variants, codes);
    // A product with no sizes is its own one row.
    return {
      rows: [{ size: { id: productId, productId, option1: sizes.product.name, option2: null, priceMinor: null, sku: null, barcode: null, active: true, stock: 0 }, codes }],
      orphans: [] as MarketplaceCode[],
    };
  }, [codes, sized, sizes.variants, sizes.product.name, productId]);

  const channelWord = channel === 'flipkart' ? t('flipkart') : t('amazon');
  const tradeWord = channel === 'flipkart' ? t('flipkartTrade') : t('amazonTrade');

  const explain = (error: unknown): { text: string; movable?: boolean } => {
    if (error instanceof ApiError && error.code === 'code_taken') return { text: error.message, movable: true };
    return { text: error instanceof ApiError && error.status < 500 ? error.message : t('failed') };
  };

  // `moving`: the code a refusal was about — "Move it" repoints THAT code, never whatever the field holds by now.
  const add = async (key: string, variantId: string | null, moving?: string) => {
    const code = (moving ?? draft[key] ?? '').trim();
    if (code === '' || inFlight.current) return;
    const ch = channel;
    inFlight.current = true;
    setBusyKey(key);
    setProblem(null);
    try {
      await api.saveMarketplaceCodes({ channel: ch, replace: moving ? true : undefined, rows: [variantId ? { code, variantId } : { code, productId }] });
      setDraft((d) => ({ ...d, [key]: '' }));
      await reload(ch);
    } catch (error) {
      const e = explain(error);
      if (channelNow.current === ch) setProblem({ key, text: e.text, movable: e.movable && !moving ? { code, variantId } : undefined });
    } finally {
      inFlight.current = false;
      setBusyKey(null);
    }
  };

  const remove = async (c: MarketplaceCode) => {
    if (inFlight.current) return;
    const ch = channel;
    inFlight.current = true;
    setBusyKey(c.id);
    setProblem(null);
    setNotice(null);
    try {
      await api.deleteMarketplaceCode(c.id);
      await reload(ch);
    } catch (error) {
      // Said at the top of the list: a failed removal has no size card of its own to say it on.
      if (channelNow.current === ch) setNotice(explain(error).text);
    } finally {
      inFlight.current = false;
      setBusyKey(null);
    }
  };

  const savePaste = async () => {
    if (inFlight.current) return;
    setPasteError(null);
    setPasteDone(null);
    const parsed = parsePaste(paste, sized);
    if (parsed.badLines.length > 0) {
      setPasteError(t('paste.badLines', { lines: parsed.badLines.slice(0, 5).join(', ') }));
      return;
    }
    if (parsed.rows.length === 0) {
      setPasteError(t('paste.empty'));
      return;
    }
    if (parsed.duplicates.length > 0) {
      const d = parsed.duplicates[0]!;
      setPasteError(t('paste.duplicate', { code: d.code, first: d.lines[0], second: d.lines[1] }));
      return;
    }
    const ch = channel;
    inFlight.current = true;
    setBusyKey('paste');
    try {
      const res = await api.saveMarketplaceCodes({ channel: ch, productId, rows: parsed.rows.map((r) => ({ code: r.code, ...(r.size ? { size: r.size } : {}) })) });
      if (channelNow.current === ch) {
        setPasteDone(t('paste.done', { created: res.created, same: res.unchanged }));
        setPaste('');
      }
      await reload(ch);
    } catch (error) {
      // The server names the row of the LIST it was sent; the person pasted lines, so name the line they can find.
      const body = error instanceof ApiError ? (error.body as { row?: unknown; code?: unknown } | undefined) : undefined;
      const row = typeof body?.row === 'number' ? parsed.rows[body.row - 1] : undefined;
      // The server's own words name the code; its 'Row n' (or the Hindi of it) is swapped for the line the person pasted.
      if (channelNow.current === ch) setPasteError(row ? t('paste.refused', { line: row.line, why: explain(error).text.replace(/^(Row|पंक्ति) \d+: /, '') }) : explain(error).text);
    } finally {
      inFlight.current = false;
      setBusyKey(null);
    }
  };

  const missing = rows ? unmappedCount(rows.rows) : 0;

  return (
    <div className="mpc">
      <div className="pf-chips mpc-channels" role="group" aria-label={t('channel')}>
        {CHANNELS.map((c) => (
          <button key={c} type="button" className={`pf-chip ${channel === c ? 'pf-chip-on' : ''}`} aria-pressed={channel === c} onClick={() => setChannel(c)}>
            {c === 'flipkart' ? t('flipkart') : t('amazon')}
          </button>
        ))}
      </div>
      <p className="mpc-hint">
        {t('whatIs', { channel: channelWord })} <span className="mpc-trade">({tradeWord})</span>
      </p>

      {loadFailed ? (
        <div className="ord-state" role="alert">
          <p>{t('loadError')}</p>
          <button type="button" className="btn" onClick={() => void load(channel)}>
            {t('retry')}
          </button>
        </div>
      ) : rows === null ? (
        <ul className="mpc-list" aria-busy="true" aria-label={t('loading')}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="mpc-row mpc-skeleton" />
          ))}
        </ul>
      ) : (
        <>
          <p className={`mpc-summary ${missing > 0 ? 'is-missing' : ''}`} role="status">
            {rows.rows.length === 0
              ? t('noSizes')
              : codes!.length === 0
                ? t('noneYet', { channel: channelWord })
                : missing === 0
                  ? t('allMapped', { channel: channelWord })
                  : t('someMissing', { count: missing, total: rows.rows.length, channel: channelWord })}
          </p>

          {notice ? (
            <p className="mpc-problem" role="alert">
              {notice}
            </p>
          ) : null}

          <ul className="mpc-list">
            {rows.rows.map(({ size, codes: held }) => {
              const key = size.id;
              const name = sized ? sizeLabel(size) : sizes.product.name;
              return (
                <li key={key} className="mpc-row">
                  <div className="mpc-size">
                    <span className="mpc-size-name">{name}</span>
                    {held.length === 0 ? <span className="mpc-none">{t('noCode')}</span> : null}
                  </div>
                  {held.length > 0 ? (
                    <ul className="mpc-chips">
                      {held.map((c) => (
                        <li key={c.id} className="mpc-chip">
                          <span className="mpc-chip-code">{c.code}</span>
                          {writable ? (
                            <button type="button" className="mpc-chip-x" aria-label={t('remove', { code: c.code })} disabled={busyKey !== null} onClick={() => void remove(c)}>
                              ×
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {writable ? (
                    <form
                      className="mpc-add"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void add(key, sized ? size.id : null);
                      }}
                    >
                      <input
                        className="input mpc-input"
                        value={draft[key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        placeholder={t('addPlaceholder', { channel: channelWord })}
                        aria-label={t('addFor', { size: name })}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={80}
                      />
                      <button type="submit" className="btn" disabled={busyKey !== null || (draft[key] ?? '').trim() === ''}>
                        {t('add')}
                      </button>
                    </form>
                  ) : null}
                  {problem?.key === key ? (
                    <div className="mpc-problem" role="alert">
                      <p>{problem.text}</p>
                      {problem.movable ? (
                        <button type="button" className="btn" disabled={busyKey !== null} onClick={() => void add(key, problem.movable!.variantId, problem.movable!.code)}>
                          {t('moveHere')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {rows.orphans.length > 0 ? (
            <section className="mpc-orphans" aria-label={t('retiredTitle')}>
              <h2>{t('retiredTitle')}</h2>
              <p className="mpc-hint">{t('retiredHint')}</p>
              <ul className="mpc-list">
                {rows.orphans.map((c) => (
                  <li key={c.id} className="mpc-row">
                    <div className="mpc-size">
                      <span className="mpc-size-name">{c.label}</span>
                      <span className="mpc-none">{t('retiredBadge')}</span>
                    </div>
                    <ul className="mpc-chips">
                      <li className="mpc-chip">
                        <span className="mpc-chip-code">{c.code}</span>
                        {writable ? (
                          <button type="button" className="mpc-chip-x" aria-label={t('remove', { code: c.code })} disabled={busyKey !== null} onClick={() => void remove(c)}>
                            ×
                          </button>
                        ) : null}
                      </li>
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {writable ? (
            <section className="mpc-paste" aria-label={t('paste.title')}>
              <button type="button" className="btn" aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>
                {t('paste.title')}
              </button>
              {pasteOpen ? (
                <div className="mpc-paste-box">
                  <p className="mpc-hint">
                    {sized ? t('paste.hintSized', { channel: channelWord }) : t('paste.hintPlain', { channel: channelWord })}
                    {sizes.axes.length > 1 ? ` ${t('paste.hintTwo')}` : ''}
                  </p>
                  <textarea
                    className="input mpc-textarea"
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    rows={6}
                    placeholder={sized ? t('paste.exampleSized') : t('paste.examplePlain')}
                    aria-label={t('paste.title')}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {pasteError ? (
                    <p className="mpc-problem" role="alert">
                      {pasteError}
                    </p>
                  ) : null}
                  {pasteDone ? (
                    <p className="mpc-ok" role="status">
                      {pasteDone}
                    </p>
                  ) : null}
                  <button type="button" className="btn btn-primary mpc-save" disabled={busyKey !== null || paste.trim() === ''} onClick={() => void savePaste()}>
                    {t('paste.save')}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
