'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type KitchenCard } from '../lib/api';
import { useBranch } from '../components/BranchProvider';
import { useSession } from '../components/SessionProvider';
import { HeaderBranchPicker } from '../components/HeaderBranchPicker';

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

  const labelOf = (c: KitchenCard): string => (c.tokenNo !== null ? t('token', { n: String(c.tokenNo).padStart(2, '0') }) : (c.tableName ?? t('order')));

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
        <h1 className="kd-title">{t('title')}</h1>
        <div className="kd-bar-right">
          <HeaderBranchPicker variant="pill" />
          <button type="button" className="btn btn-ghost" aria-pressed={chime} onClick={toggleChime}>
            {chime ? t('chimeOn') : t('chimeOff')}
          </button>
        </div>
      </div>

      {failed ? (
        <p className="kd-offline" role="alert">
          {t('offline')}
        </p>
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
                  <span className="kd-card-type">{c.orderType ? t(`type.${c.orderType}`) : ''}</span>
                  <span className="kd-card-age">{t(ageKey(c.late, mins), { min: mins })}</span>
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
                        <span className="kd-qty">{d.qty} ×</span>
                        <span className="kd-dish-name">{d.name}</span>
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
