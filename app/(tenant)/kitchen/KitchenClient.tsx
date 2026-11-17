'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type KitchenCard } from '../lib/api';
import { useBranch } from '../components/BranchProvider';
import { useSession } from '../components/SessionProvider';
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
 */

export const KITCHEN_REFRESH_MS = 4_000;
const UNDO_MS = 10_000;
const CHIME_KEY = 'growza.kitchen.chime';

export const minutesSince = (iso: string, nowMs: number): number => Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
/** Which words a card's age is said in: "Just now" in its first minute, never "0 min". */
export const ageKey = (late: boolean, mins: number): 'lateFor' | 'justNow' | 'minutes' => (late ? 'lateFor' : mins === 0 ? 'justNow' : 'minutes');

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
  const branch = useBranch();
  const session = useSession();
  const location = branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;
  const [cards, setCards] = useState<KitchenCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [off, setOff] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [undo, setUndo] = useState<{ saleId: string; label: string; until: number } | null>(null);
  const [chime, setChime] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const mayLeave = session?.role === 'owner' || session?.role === 'manager';

  useEffect(() => {
    try {
      setChime(localStorage.getItem(CHIME_KEY) === 'on');
    } catch {
      /* a private window: no chime, as by default */
    }
  }, []);

  const load = useCallback(async () => {
    if (!location) return;
    try {
      const answer = await api.kitchen(location);
      setCards(answer.cards);
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
  }, [location, chime]);

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

  const ready = async (c: KitchenCard) => {
    setCards((prev) => (prev ?? []).filter((x) => x.saleId !== c.saleId));
    try {
      await api.kitchenReady(c.saleId, true);
      setUndo({ saleId: c.saleId, label: labelOf(c), until: Date.now() + UNDO_MS });
    } catch {
      void load();
    }
  };
  const doUndo = async () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try {
      await api.kitchenReady(u.saleId, false);
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
          {/* Owner, 2026-11-17 — "Chime" was the design's word; "Sound" is the plain one. The speaker is struck through while off. */}
          <button type="button" className="btn btn-ghost kd-sound" aria-pressed={chime} onClick={toggleChime}>
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

      {failed ? (
        <p className="kd-offline" role="alert">
          {t('offline')}
        </p>
      ) : null}

      {/* Review #5 — off by default (a browser plays nothing until someone taps), so the screen says so until it is on. */}
      {!chime ? (
        <div className="kd-sound-hint">
          <span>{t('soundHint')}</span>
          <button type="button" className="btn" onClick={toggleChime}>
            {t('turnOn')}
          </button>
        </div>
      ) : null}

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
        <ul className="kd-grid">
          {cards.map((c) => {
            const mins = minutesSince(c.placedAt, now);
            return (
              <li key={c.saleId} className={`kd-card${c.late ? ' is-late' : ''}`} aria-label={labelOf(c)}>
                <div className="kd-card-head">
                  <span className="kd-card-label">{labelOf(c)}</span>
                  {c.orderType ? (
                    <span className={`kd-card-type is-${c.orderType}`}>
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                        <path d={TYPE_ICON[c.orderType]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {t(`type.${c.orderType}`)}
                    </span>
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
                </div>
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
