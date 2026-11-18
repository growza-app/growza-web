'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from '../../shared/AppLink';
import { api, formatMoney, type DiningArea, type DiningTable } from '../lib/api';

/**
 * Jira GRW-721 — the room, the way the counter sees it: areas as headings, tables as tiles, like seats in a cinema.
 *
 * Four states, each said in WORDS on the tile as well as its colour (UX: colour is never the only signal), and named
 * once in a legend above the room (Jira GRW-731):
 *   Free · Food cooking (the kitchen has not marked it Ready) · Eating (every slip Ready) · Bill printed (waiting to pay).
 * Food cooking and Eating carry the minutes seated and the running total. Bill printed wins over the two cooking states
 * (BR-02); a round sent after Ready makes the table Food cooking again (BR-01) — the server clears Ready.
 * Tapping a free table starts its order; tapping a busy one opens its bill. Another device's change shows within
 * 5 seconds (the map asks again every 5 s while it is on screen — one request, one query on the server). A failed
 * refresh keeps the last map and says so; it never blanks the room.
 */

export const TABLE_REFRESH_MS = 5_000;

export type TableState = 'free' | 'cooking' | 'eating' | 'bill';
/** The legend's order: the way a table's evening goes. */
export const TABLE_STATES: readonly TableState[] = ['free', 'cooking', 'eating', 'bill'];
/**
 * Bill printed wins (BR-02); then the kitchen. An older API that does not say (`foodCooking` absent) is read as cooking:
 * "still waiting on the kitchen" is the safer thing to tell a counter than "eating".
 */
export const stateOf = (t: DiningTable): TableState =>
  !t.openBill ? 'free' : t.openBill.billPrinted ? 'bill' : t.openBill.foodCooking === false ? 'eating' : 'cooking';

/** Minutes since the table was opened, as the tile says it. */
export function minutesSeated(seatedAtISO: string, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - Date.parse(seatedAtISO)) / 60_000));
}

export function TableMap({
  location,
  canSetUp,
  onFree,
  onBusy,
  refreshKey,
}: {
  location: string;
  /** The owner and a manager are offered the way to Settings › Tables from an empty room. */
  canSetUp: boolean;
  onFree: (table: DiningTable, area: DiningArea) => void;
  onBusy: (table: DiningTable, area: DiningArea) => void;
  /** Bumped by the till after it sends, pays or closes, so the map reads again at once. */
  refreshKey: number;
}) {
  const t = useTranslations('posTables');
  const [areas, setAreas] = useState<DiningArea[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const live = useRef(true);

  const load = useCallback(async () => {
    try {
      const answer = await api.diningTables(location);
      if (!live.current) return;
      setAreas(answer.areas);
      setFailed(false);
      setNow(Date.now());
    } catch {
      if (live.current) setFailed(true);
    }
  }, [location]);

  useEffect(() => {
    live.current = true;
    void load();
    const timer = setInterval(() => void load(), TABLE_REFRESH_MS);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [load, refreshKey]);

  if (areas === null && !failed) {
    return (
      <div className="tm-map" aria-busy="true" aria-label={t('loading')}>
        <div className="tm-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="tm-tile tm-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  const money = (minor: number) => formatMoney(String(minor));
  const tables = (areas ?? []).reduce((n, a) => n + a.tables.length, 0);

  return (
    <div className="tm-map">
      {/* Jira GRW-731 — what each colour means, once, above the room. A list, so a screen reader hears four states. */}
      {tables > 0 ? (
        <ul className="tm-legend" aria-label={t('legendAria')}>
          {TABLE_STATES.map((s) => (
            <li key={s} className={`tm-key is-${s}`}>
              <span className="tm-swatch" aria-hidden="true" />
              {t(`state.${s}`)}
            </li>
          ))}
        </ul>
      ) : null}
      {failed ? (
        <div className="tm-failed" role="alert">
          <span>{areas ? t('staleMap') : t('loadFailed')}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      {areas && tables === 0 ? (
        <div className="tm-empty">
          <p className="tm-empty-title">{t('emptyTitle')}</p>
          {canSetUp ? (
            <Link className="btn" href={`/settings/tables/${location}`}>
              {t('setUp')}
            </Link>
          ) : (
            <p className="field-hint">{t('emptyAskOwner')}</p>
          )}
        </div>
      ) : null}

      {(areas ?? []).map((area) =>
        area.tables.length === 0 ? null : (
          <section key={area.id} className="tm-area" aria-labelledby={`tm-area-${area.id}`}>
            <h2 id={`tm-area-${area.id}`} className="tm-area-name">
              {area.name}
            </h2>
            <div className="tm-grid">
              {area.tables.map((table) => {
                const state = stateOf(table);
                const bill = table.openBill;
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={`tm-tile is-${state}`}
                    aria-label={`${table.name}, ${t(`state.${state}`)}${bill ? `, ${money(bill.totalMinor)}` : ''}`}
                    onClick={() => (state === 'free' ? onFree(table, area) : onBusy(table, area))}
                  >
                    <span className="tm-name">{table.name}</span>
                    <span className="tm-state">{t(`state.${state}`)}</span>
                    {bill ? (
                      <span className="tm-detail">
                        {t('seated', { min: minutesSeated(bill.seatedAt, now) })} · {money(bill.totalMinor)}
                      </span>
                    ) : table.seats ? (
                      <span className="tm-detail">{t('seats', { n: table.seats })}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
