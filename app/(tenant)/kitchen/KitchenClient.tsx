'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type KitchenCard } from '../lib/api';
import { useBranch } from '../components/BranchProvider';
import AppLink from '../../shared/AppLink';
import { useMayOpen, useRecipesOn, useSession } from '../components/SessionProvider';
import { HeaderBranchPicker } from '../components/HeaderBranchPicker';
import { SignOutButton } from '../components/SignOutButton';

/**
 * Jira GRW-714 — the kitchen's tablet: one card per order being cooked, oldest first. Large type read at arm's length; every tap target 44px
 * or more, for wet or gloved hands. No money and no contact details are ever on a card — the API does not send them (BR-01).
 *
 * New orders arrive within 5 seconds (the screen asks every 4). A failed refresh keeps the last cards and says "Not connected — retrying".
 * A dish ticked here is ticked on every tablet (it is saved on the dish). Ready takes the card off — on every screen — and Undo is on screen
 * for the 10 seconds the server allows (BR-02). A card past the branch's late time turns amber AND says how many minutes, so colour is never
 * the only signal. One short chime for a new order, off until this tablet turns it on.
 *
 * Jira GRW-733 — where the branch has kitchen stations, a tablet shows one station's part (Tandoor, Bar, Kitchen) or all of them, chosen on
 * the tablet and kept on it. A station's Ready takes the card off THAT screen; the order is Ready once every station has marked its part.
 */

export const KITCHEN_REFRESH_MS = 4_000;
const UNDO_MS = 10_000;
const CHIME_KEY = 'growza.kitchen.chime';
/** Jira GRW-733 — which station this tablet shows, kept on the tablet: `kitchen` for the default, a station's id, or nothing for all. */
const STATION_KEY = 'growza.kitchen.station';

export const minutesSince = (iso: string, nowMs: number): number => Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
/** Which words a card's age is said in: "Just now" in its first minute, never "0 min". */
export const ageKey = (late: boolean, mins: number): 'lateFor' | 'justNow' | 'minutes' => (late ? 'lateFor' : mins === 0 ? 'justNow' : 'minutes');

/**
 * Jira GRW-730 — who sent the order, said beside its minutes ("Ravi · 5 min"): each sender once, first sender first
 * ("Ravi, Amit" when a second waiter added a round). Null when nobody is named (an older order or an older API).
 */
export const sentByOf = (takenBy: readonly string[] | undefined): string | null => {
  const names = (takenBy ?? []).map((n) => n.trim()).filter(Boolean);
  return names.length > 0 ? names.join(', ') : null;
};

/**
 * Owner, 2026-11-17 (review #6) — Half or Full is what the cook acts on, so the portion is set in bold. The line's own name
 * ("Chicken Biryani (Half - 2 pcs) + Raita") is split around the portion the API names, never guessed from brackets: a
 * dish whose own name has brackets ("Chicken Drumstick (2 pcs)") stays as it is.
 */
export function portionParts(name: string, size: string | null | undefined): { before: string; size: string | null; after: string } {
  const marker = size ? ` (${size})` : null;
  const at = marker ? name.indexOf(marker) : -1;
  if (!marker || at < 0) return { before: name, size: null, after: '' };
  return { before: name.slice(0, at), size: size!, after: name.slice(at + marker.length) };
}

const TYPE_ICON: Record<'dine_in' | 'takeaway' | 'delivery', string> = {
  // A plate with a fork; a carry bag; a scooter — one line weight, as the rest of the app's icons.
  dine_in: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  takeaway: 'M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 0 1 6 0v2',
  delivery: 'M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0m10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0M9 17h6l2-6h-4l-1-3H8M17 11l2 6',
};

export function KitchenClient() {
  const t = useTranslations('kitchen');
  const tks = useTranslations('kitchenStock');
  // Jira GRW-737 — the cook reads what the kitchen has left (amounts only), from the kitchen screen they live on. Jira GRW-741 — Inventory.
  const mayOpen = useMayOpen();
  const stockLink = useRecipesOn() && mayOpen('/inventory');
  const branch = useBranch();
  const session = useSession();
  const location = branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;
  const [cards, setCards] = useState<KitchenCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [off, setOff] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [undo, setUndo] = useState<{ saleId: string; label: string; until: number; station?: string | null } | null>(null);
  const [chime, setChime] = useState(false);
  /** Owner, 2026-11-17 — one kind of order at a time in a rush; on this tablet only, never saved. */
  const [only, setOnly] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  /** Jira GRW-733 — this tablet's station (null: every station) and the branch's stations, for the filter. */
  const [station, setStation] = useState<string | null>(null);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const seen = useRef<Set<string> | null>(null);
  const mayLeave = session?.role === 'owner' || session?.role === 'manager';

  useEffect(() => {
    try {
      setChime(localStorage.getItem(CHIME_KEY) === 'on');
      setStation(localStorage.getItem(STATION_KEY) || null);
    } catch {
      /* a private window: no chime, as by default */
    }
  }, []);

  const load = useCallback(async () => {
    if (!location) return;
    try {
      const answer = await api.kitchen(location, station);
      setCards(answer.cards);
      setStations(answer.stations ?? []);
      setFailed(false);
      setNow(Date.now());
      const ids = new Set(answer.cards.map((c) => c.saleId));
      if (seen.current && chime && answer.cards.some((c) => !seen.current!.has(c.saleId))) {
        try {
          const ctx = new AudioContext();
          const o = ctx.createOscillator();
          o.frequency.value = 880;
          o.connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + 0.15);
        } catch {
          /* no audio here */
        }
      }
      seen.current = ids;
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setOff(e.message);
      else setFailed(true);
    }
  }, [location, chime, station]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), KITCHEN_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);

  // Jira GRW-716 — an order taken while the till was offline is called by its till's token ("A12").
  const labelOf = (c: KitchenCard): string =>
    c.offlineToken ? c.offlineToken : c.tokenNo !== null ? t('token', { n: String(c.tokenNo).padStart(2, '0') }) : (c.tableName ?? t('order'));

  /** Jira GRW-733 — the station this screen marks Ready for, by name; null on an all-stations screen. */
  const stationName = station === null ? null : station === 'kitchen' ? t('kitchenStation') : (stations.find((s) => s.id === station)?.name ?? null);
  const ready = async (c: KitchenCard) => {
    setCards((prev) => (prev ?? []).filter((x) => x.saleId !== c.saleId));
    try {
      await api.kitchenReady(c.saleId, true, station);
      setUndo({ saleId: c.saleId, label: stationName ? t('stationReadyDone', { label: labelOf(c), station: stationName }) : labelOf(c), until: Date.now() + UNDO_MS, station });
    } catch {
      void load();
    }
  };
  const doUndo = async () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try {
      await api.kitchenReady(u.saleId, false, u.station ?? null);
    } finally {
      void load();
    }
  };
  const tick = async (c: KitchenCard, dishId: string, done: boolean) => {
    setCards((prev) => (prev ?? []).map((x) => (x.saleId === c.saleId ? { ...x, dishes: x.dishes.map((d) => (d.id === dishId ? { ...d, done } : d)) } : x)));
    try {
      await api.kitchenDishDone(dishId, done);
    } catch {
      void load();
    }
  };
  const pickStation = (next: string | null) => {
    setStation(next);
    setCards(null);
    seen.current = null;
    try {
      if (next) localStorage.setItem(STATION_KEY, next);
      else localStorage.removeItem(STATION_KEY);
    } catch {
      /* stays for this visit */
    }
  };
  const toggleChime = () => {
    const next = !chime;
    setChime(next);
    try {
      localStorage.setItem(CHIME_KEY, next ? 'on' : 'off');
    } catch {
      /* stays for this visit */
    }
  };

  if (off) {
    return (
      <div className="kd-empty" role="status">
        <p className="kd-empty-title">{off}</p>
      </div>
    );
  }

  return (
    <div className="kd">
      <div className="kd-bar">
        {/* Review #1 — no bottom bar here; the owner and manager get one way back. A Kitchen login has nowhere else to go. */}
        {mayLeave ? (
          <a className="kd-back" href="/">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('back')}
          </a>
        ) : null}
        <h1 className="kd-title">{t('title')}</h1>
        <div className="kd-bar-right">
          <HeaderBranchPicker variant="pill" />
          {stockLink ? (
            <AppLink className="btn btn-ghost kd-stock-link" href="/inventory">
              {tks('title')}
            </AppLink>
          ) : null}
          {/* Owner, 2026-11-17 — "Chime" was the design's word; "Sound" is the plain one. The speaker is struck through while off. */}
          <button type="button" className={`btn btn-ghost kd-sound${chime ? '' : ' is-off'}`} aria-pressed={chime} title={chime ? undefined : t('soundHint')} onClick={toggleChime}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              {chime ? (
                <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
            {chime ? t('soundOn') : t('soundOff')}
          </button>
          {/* Owner, 2026-11-17 — a Kitchen login has no sidebar and no header menu: this is its way to sign out. */}
          {mayLeave ? null : <SignOutButton className="btn btn-ghost kd-signout">{t('signOut')}</SignOutButton>}
        </div>
      </div>

      {/* Jira GRW-733 — the station this tablet shows; only where the branch has named stations. */}
      {stations.length > 0 ? (
        <div className="kd-stations" role="group" aria-label={t('stationFilterAria')}>
          {[{ key: null as string | null, name: t('stationAll') }, { key: 'kitchen', name: t('kitchenStation') }, ...stations.map((s) => ({ key: s.id as string | null, name: s.name }))].map((s) => (
            <button key={s.key ?? 'all'} type="button" className="kd-filter kd-station-pick" aria-pressed={station === s.key} onClick={() => pickStation(s.key)}>
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      {failed ? (
        <p className="kd-offline" role="alert">
          {t('offline')}
        </p>
      ) : null}

      {/*
        Review #5 — sound is off by default (a browser plays nothing until someone taps). Owner, 17 Nov 2026 — the
        banner that said so repeated the button above it in 118px of green; the button itself now turns amber while off.
      */}

      {cards === null ? (
        <div className="kd-grid" aria-busy="true" aria-label={t('loading')}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="kd-card kd-skeleton" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="kd-empty" role="status">
          <p className="kd-empty-title">{t('empty')}</p>
        </div>
      ) : (
        <>
        {/* The rush at a glance: how many, how many late, how many with dishes not yet seen; and a filter by how it is eaten. */}
        <div className="kd-summary" role="group" aria-label={t('summaryAria')}>
          <span className="kd-count">{t('waiting', { n: cards.length })}</span>
          {cards.some((c) => c.late) ? <span className="kd-count is-late">{t('lateCount', { n: cards.filter((c) => c.late).length })}</span> : null}
          {cards.some((c) => c.dishes.some((d) => d.isNew)) ? <span className="kd-count">{t('newCount', { n: cards.filter((c) => c.dishes.some((d) => d.isNew)).length })}</span> : null}
          <span className="kd-filters">
            {(['all', 'dine_in', 'takeaway', 'delivery'] as const)
              .filter((k) => k === 'all' || cards.some((c) => c.orderType === k))
              .map((k) => (
                <button key={k} type="button" className="kd-filter" aria-pressed={only === k} onClick={() => setOnly(k)}>
                  {k === 'all' ? t('all') : t(`type.${k}`)} {k === 'all' ? cards.length : cards.filter((c) => c.orderType === k).length}
                </button>
              ))}
          </span>
        </div>
        <ul className="kd-grid">
          {cards.filter((c) => only === 'all' || c.orderType === only).map((c) => {
            const mins = minutesSince(c.placedAt, now);
            const sentBy = sentByOf(c.takenBy);
            return (
              <li key={c.saleId} className={`kd-card${c.late ? ' is-late' : ''}`} aria-label={labelOf(c)}>
                <div className="kd-card-head">
                  <span className="kd-card-label">{labelOf(c)}</span>
                  {/* Laptop sweep 2026-11-22 — who and how long travel as one piece: beside the table when there is room, on
                      their own line under it when not ("T10 · T… Arj…" at 1366), so the table is never the part that is cut. */}
                  <span className="kd-card-when">
                    {/* Jira GRW-730 — whom to ask about a dish. A long name gives way (…) before the minutes ever do. */}
                    {sentBy ? (
                      <>
                        <span className="kd-card-by" title={t('sentBy', { name: sentBy })}>
                          {sentBy}
                        </span>
                        <span className="kd-card-dot" aria-hidden="true">
                          ·
                        </span>
                      </>
                    ) : null}
                    <span className="kd-card-age">
                      {/* Review #4 — late is said with a clock and words, never by the amber alone. */}
                      {c.late ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                          <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                      {t(ageKey(c.late, mins), { min: mins })}
                    </span>
                  </span>
                </div>
                {/* Owner, 2026-11-17 — "the kitchen has no option to view if the order is dine in or take away": its own line, the word
                    always written out, on every ticket and every width. Plate it or pack it is the cook's second question. */}
                {c.orderType ? (
                  <span className={`kd-card-type is-${c.orderType}`}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                      <path d={TYPE_ICON[c.orderType]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t(`type.${c.orderType}`)}
                  </span>
                ) : null}
                <ul className="kd-dishes">
                  {c.dishes.map((d) => (
                    <li key={d.id} className={`kd-dish${d.done ? ' is-done' : ''}${d.cancelled ? ' is-off' : ''}`}>
                      <button
                        type="button"
                        className="kd-dish-btn"
                        aria-pressed={d.done}
                        disabled={d.cancelled}
                        onClick={() => void tick(c, d.id, !d.done)}
                      >
                        {/* Review #3 — the row says it can be ticked: a circle that fills when the dish is done. */}
                        <span className="kd-tick" aria-hidden="true">
                          {d.done ? (
                            <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
                              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </span>
                        <span className="kd-qty">{d.qty} ×</span>
                        <span className="kd-dish-name">
                          {(() => {
                            const p = portionParts(d.name, d.size);
                            return p.size ? (
                              <>
                                {p.before} · <strong className="kd-portion">{p.size}</strong>
                                {p.after}
                              </>
                            ) : (
                              d.name
                            );
                          })()}
                        </span>
                        {/* Jira GRW-733 — on an all-stations screen, whose dish it is. */}
                        {station === null && d.station ? <span className="kd-station">{d.station}</span> : null}
                        {d.isNew ? <span className="kd-new">{t('new')}</span> : null}
                        {d.cancelled ? <span className="kd-off">{t('cancelled')}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn kd-ready" onClick={() => void ready(c)}>
                  {t('ready')}
                </button>
              </li>
            );
          })}
        </ul>
        </>
      )}

      {undo ? (
        <div className="kd-undo" role="status">
          <span>{t('readyDone', { label: undo.label })}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void doUndo()}>
            {t('undo')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
