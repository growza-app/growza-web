'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, formatMoney, type DiningArea, type DiningTable, type OrderDetail } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';
import { useBackCloses } from '../lib/use-back-closes';
import { useScrimDismiss } from '../../shared/a11y/scrim-dismiss';
import type { useTicketPrinter } from '../components/TicketPrinter';
import { useWaiter } from './waiter';
import { minutesSeated, stateOf, STILL_SEATED_MIN } from './TableMap';
import { useSession } from '../components/SessionProvider';

/**
 * Jira GRW-721 — one table's running bill: what it has had, what it comes to, and the four things a counter does with
 * it — add a round, print the bill, take payment, and (owner or manager) take a dish off. A table with nothing left on
 * it closes without a bill (BR-05).
 *
 * Every action answers from the server and the sheet reads the bill again, so two counters on one table see one bill.
 * Jira GRW-722 — "Move table" lists the branch's other tables: a free one takes the party (Move here), a busy one takes
 * this bill onto its own (Join). Nothing is sent to the kitchen again; the server refuses either once money was taken.
 *
 * Jira GRW-732 — a Seated table (guests sat, nothing ordered yet) opens the same sheet with no bill: Take order, Move
 * table (BR-03: only to a free table) and Free again (AC-03: the guests left; nothing is a sale).
 *
 * Payment follows the owner's rule of 4 Nov 2026: a bill names who paid before the money is taken, so an unnamed table
 * asks for a name first (one field, then the way of paying).
 */

const MODES = ['cash', 'upi', 'card'] as const;

export function TableBillSheet({
  table,
  areaName,
  location,
  canManage,
  printer,
  onAddDishes,
  onTakePayment,
  onDone,
}: {
  table: DiningTable;
  areaName: string;
  /** The branch whose room this is — Move table lists its other tables. */
  location: string;
  /** The owner or a manager: may take a dish off (owner decision 2026-11-16). */
  canManage: boolean;
  printer: ReturnType<typeof useTicketPrinter>;
  onAddDishes: () => void;
  /**
   * Owner, 17 Nov 2026 — given, Take payment hands the bill to the POS's payment screen instead of the three buttons here —
   * a waiter's too, where that screen asks for a name only and offers no discount or points.
   */
  onTakePayment?: () => void;
  /** Closed, paid, or dismissed — the map reads again, and says what happened when something did. */
  onDone: (said?: string) => void;
}) {
  const t = useTranslations('posTables');
  // Jira GRW-723 — a waiter: no Print bill, and payment only once the counter has printed it (owner decision 2026-11-16).
  const waiter = useWaiter();
  // Jira GRW-724 — the service charge this branch offers (never added by itself; the counter adds it when the guest agrees).
  const offerBp = useSession()?.branches?.find((b) => b.id === location)?.serviceChargeBp ?? null;
  // Jira GRW-732 — no bill: a Seated table. Nothing to read; the sheet offers the order, a move and Free again.
  const seatedOnly = !table.openBill;
  const saleId = table.openBill?.saleId ?? '';
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose: () => onDone(), initialFocus: 'container' });
  // QA of the overnight stack (item 11) — the phone's Back closes this sheet, and never leaves the POS.
  useBackCloses(() => onDone());
  const scrimDismiss = useScrimDismiss(() => onDone());
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [guestName, setGuestName] = useState('');
  /**
   * Jira GRW-737 — `askCooked` once the server answers `cooked_unknown`: the kitchen was sent this dish and never ticked it Done, so whoever
   * takes it off says whether it was cooked (yes: its food is wasted; no: back to the kitchen's stock). Required: no answer, no take-off.
   */
  const [takingOff, setTakingOff] = useState<{ lineId: string; name: string; reason: string; askCooked?: boolean; cooked?: boolean } | null>(null);
  /** "Take off a dish" pressed: each dish shows its Take off. Off by default — taking a dish off is rare. */
  const [editing, setEditing] = useState(false);
  const reasonRef = useRef<HTMLFormElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const takingOffLine = takingOff?.lineId ?? null;
  useEffect(() => {
    if (takingOffLine === null) return;
    reasonInputRef.current?.focus({ preventScroll: true });
    reasonRef.current?.scrollIntoView({ block: 'nearest' });
  }, [takingOffLine]);
  /** Move table: the room as it is now (null = not open; [] while it loads). */
  const [moving, setMoving] = useState<DiningArea[] | null>(null);
  /** The table picked, waiting for the one confirm: a mis-tap must not move a party, and a join cannot be undone. */
  const [picked, setPicked] = useState<DiningTable | null>(null);

  const openMove = () =>
    void run(async () => {
      setMoving([]);
      setMoving((await api.diningTables(location)).areas);
    });
  /**
   * What a table in the Move list takes: a free one the party (Move here), a busy one this bill (Join). Nothing goes onto
   * a Seated table (Jira GRW-732), and a Seated party with no order has no bill to join with another.
   */
  const targetOf = (x: DiningTable): 'move' | 'join' | null => (x.openBill ? (seatedOnly ? null : 'join') : x.seated ? null : 'move');
  const moveTo = (to: DiningTable) =>
    run(
      () => (to.openBill ? api.joinTable(table.id, to.id) : api.moveTable(table.id, to.id)),
      'done',
      to.openBill ? t('joinedOk', { from: table.name, to: to.name }) : t('movedOk', { from: table.name, to: to.name }),
    );

  const read = useCallback(async () => {
    if (seatedOnly) return;
    try {
      setOrder(await api.order(saleId));
    } catch {
      setError(t('billLoadFailed'));
    }
  }, [saleId, seatedOnly, t]);
  useEffect(() => void read(), [read]);

  const run = async (job: () => Promise<unknown>, after: 'read' | 'done' = 'read', said?: string) => {
    setBusy(true);
    setError(null);
    try {
      await job();
      if (after === 'done') onDone(said);
      else await read();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Jira GRW-737 — take a dish off; the first try may come back asking whether it was cooked, and the sheet asks right under the reason.
  const takeOff = async () => {
    if (!takingOff) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelBillItems(saleId, [takingOff.lineId], takingOff.reason, takingOff.askCooked ? takingOff.cooked : undefined);
      setTakingOff(null);
      setEditing(false);
      await read();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cooked_unknown') setTakingOff({ ...takingOff, askCooked: true });
      else setError(e instanceof ApiError ? e.message : t('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const money = (minor: number | string | undefined) => formatMoney(String(minor ?? 0));
  // QA of GRW-741 — the GST added on top is a line of its own (`tax`): it is no dish, so it is never offered to Take off.
  const dishes = (order?.lines ?? []).filter((l) => l.kind !== 'service_charge' && l.kind !== 'tax');
  const charge = (order?.lines ?? []).find((l) => l.kind === 'service_charge') ?? null;
  const live = dishes.filter((l) => !l.cancelReason && l.qty > l.returnedQty);
  const totalMinor = (order?.lines ?? []).reduce((n, l) => n + Number(l.paidMinor ?? 0) - Number(l.returnedMinor ?? 0), 0);
  const anonymous = !order?.client || /^walk-in$/i.test(order.client.name ?? '');
  // One person took every dish: said once under the title, not under each dish.
  const takers = new Set(dishes.map((l) => l.addedBy ?? ''));
  const oneTaker = takers.size === 1 && !takers.has('') ? [...takers][0]! : null;
  const seatedAt = table.openBill?.seatedAt ?? table.seated?.at;
  const seatedMin = seatedAt ? minutesSeated(seatedAt, Date.now()) : null;

  const pay = (mode: (typeof MODES)[number]) =>
    run(async () => {
      if (anonymous) {
        const name = guestName.trim();
        if (!name) throw new ApiError(400, t('guestNeeded'));
        await api.assignClientToSale(saleId, { name });
      }
      await api.settleCounterSale(saleId, { paymentMode: mode });
    }, 'done', t('paidOk', { table: table.name, amount: money(totalMinor) }));

  const moveBlock = moving ? (
              <div className="tb-move" role="group" aria-label={t('moveTitle', { table: table.name })}>
                <p className="field-hint">{seatedOnly ? t('moveHintSeated') : t('moveHint')}</p>
                {moving.length === 0 ? <p className="field-hint">{t('loading')}</p> : null}
                {picked ? (
                  <div className="tb-confirm" role="alertdialog" aria-label={picked.openBill ? t('confirmJoinTitle', { from: table.name, to: picked.name }) : t('confirmMoveTitle', { from: table.name, to: picked.name })}>
                    <p className="tb-confirm-title">
                      {picked.openBill ? t('confirmJoinTitle', { from: table.name, to: picked.name }) : t('confirmMoveTitle', { from: table.name, to: picked.name })}
                    </p>
                    <p className="field-hint">
                      {picked.openBill
                        ? t('confirmJoinLine', { to: picked.name, amount: money(totalMinor + picked.openBill.totalMinor) })
                        : t('confirmMoveLine', { to: picked.name, amount: money(totalMinor) })}
                    </p>
                    <div className="dt-actions">
                      <button type="button" className="btn" disabled={busy} onClick={() => void moveTo(picked)}>
                        {picked.openBill ? t('join') : t('moveHere')}
                      </button>
                      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPicked(null)}>
                        {t('back')}
                      </button>
                    </div>
                  </div>
                ) : null}
                {moving.map((area) => {
                  const others = area.tables.filter((x) => x.id !== table.id);
                  return others.length === 0 ? null : (
                    <section key={area.id} className="tb-move-area">
                      <h3 className="tb-move-name">{area.name}</h3>
                      <div className="tb-move-grid">
                        {others.map((x) => {
                          // Jira GRW-732 — a table that takes nothing from here (Seated, or a bill a Seated party cannot join) says what it is, and cannot be picked.
                          const takes = targetOf(x);
                          return (
                            <button
                              key={x.id}
                              type="button"
                              className={`tm-tile is-${stateOf(x)}`}
                              disabled={busy || takes === null}
                              aria-pressed={picked?.id === x.id}
                              aria-label={
                                takes === 'join' && x.openBill
                                  ? t('joinTo', { table: x.name, amount: money(x.openBill.totalMinor) })
                                  : takes === 'move'
                                    ? t('moveTo', { table: x.name })
                                    : `${x.name}, ${t(`state.${stateOf(x)}`)}`
                              }
                              onClick={() => setPicked(x)}
                            >
                              <span className="tm-name">{x.name}</span>
                              <span className="tm-state">{takes === 'join' ? t('join') : takes === 'move' ? t('moveHere') : t(`state.${stateOf(x)}`)}</span>
                              {x.openBill ? <span className="tm-detail">{money(x.openBill.totalMinor)}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
                <button type="button" className="btn btn-ghost" onClick={() => { setMoving(null); setPicked(null); }}>
                  {t('cancel')}
                </button>
              </div>
  ) : null;

  return (
    <div className="pf-keypad-scrim" {...scrimDismiss}>
      <div ref={ref} className="pf-keypad tb-sheet" role="dialog" aria-modal="true" aria-label={`${table.name} · ${areaName}`} tabIndex={-1}>
        {/*
          Owner, 17 Nov 2026 (design review) — the table is the title, with its room, how long it has been seated and
          who took the order under it; the dishes scroll; Total and Take payment stay pinned at the bottom.
        */}
        <div className="pf-keypad-head tb-head">
          <span className="tb-title">
            <span className="pf-keypad-title tb-title-name">{table.name}</span>
            <span className="tb-title-sub">
              {[
                areaName,
                seatedMin === null ? null : seatedOnly ? t('seatedFor', { min: seatedMin }) : t('seated', { min: seatedMin }),
                seatedOnly && table.seated?.guests ? t('guestsN', { n: table.seated.guests }) : null,
                oneTaker ? t('takenBy', { name: oneTaker }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <button type="button" className="pf-keypad-clear" onClick={() => onDone()}>
            {t('close')}
          </button>
        </div>

        {/* Jira GRW-732 — Seated, nothing ordered: take the order, move the party, or free the table. */}
        {seatedOnly ? (
          <div className="tb-seated">
            {seatedMin !== null && seatedMin >= STILL_SEATED_MIN ? <p className="field-hint tb-still">{t('stillSeatedAsk')}</p> : null}
            {moving ? (
              moveBlock
            ) : (
              <div className="tb-actions">
                <button type="button" className="btn tb-take-order" disabled={busy} onClick={onAddDishes}>
                  {t('takeOrder')}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={openMove}>
                  {t('moveTable')}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => api.freeTable(table.id), 'done', t('freedOk', { table: table.name }))}>
                  {t('freeAgain')}
                </button>
              </div>
            )}
            {error ? (
              <p className="al-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        {order === null && !error && !seatedOnly ? <p className="field-hint">{t('billLoading')}</p> : null}
        {order ? (
          <>
            {/* While a reason is typed, every row and link stays where it was, greyed out: the sheet never drops. */}
            <ul className={`tb-lines${editing ? ' is-editing' : ''}`}>
              {dishes.map((l) => (
                <li key={l.id} className={`tb-line${l.cancelReason ? ' is-off' : ''}`}>
                  <span className="tb-line-qty">{l.qty}×</span>
                  <span className="tb-line-name">
                    {l.name}
                    {l.cancelReason ? <span className="tb-off">{t('takenOff', { reason: l.cancelReason })}</span> : null}
                    {l.addedBy && !l.cancelReason && !oneTaker ? <span className="tb-off">{t('takenBy', { name: l.addedBy })}</span> : null}
                  </span>
                  <span className="tb-line-amount">{money(Number(l.paidMinor ?? 0) - Number(l.returnedMinor ?? 0))}</span>
                  {/* Take off is rare and the owner's or a manager's: its buttons show only after "Take off a dish". */}
                  {editing && canManage && !l.cancelReason && !moving ? (
                    <button type="button" className="btn btn-ghost tb-off-btn" disabled={busy || takingOff !== null} onClick={() => setTakingOff({ lineId: l.id, name: l.name, reason: '' })}>
                      {t('takeOff')}
                    </button>
                  ) : null}
                  {/* Owner, 17 Nov 2026 — the reason is asked right under the dish coming off, ready to type, and the rest
                      of the sheet steps back until it is taken off or cancelled. */}
                  {takingOff?.lineId === l.id ? (
                    <form
                      id="tb-reason-form"
                      className="tb-reason"
                      ref={reasonRef}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void takeOff();
                      }}
                    >
                      <label className="dt-field">
                        <span className="field-hint">{t('whyOffShort')}</span>
                        <input ref={reasonInputRef} type="text" aria-label={t('whyOff', { name: takingOff.name })} value={takingOff.reason} maxLength={200} onChange={(e) => setTakingOff({ ...takingOff, reason: e.target.value })} />
                      </label>
                      {takingOff.askCooked ? (
                        <fieldset className="tb-cooked">
                          <legend className="field-hint">{t('cookedQuestion')}</legend>
                          <div className="tb-cooked-pair">
                            <button type="button" className={`btn btn-ghost ${takingOff.cooked === false ? 'is-on' : ''}`} aria-pressed={takingOff.cooked === false} onClick={() => setTakingOff({ ...takingOff, cooked: false })}>
                              {t('cookedNo')}
                            </button>
                            <button type="button" className={`btn btn-ghost ${takingOff.cooked === true ? 'is-on' : ''}`} aria-pressed={takingOff.cooked === true} onClick={() => setTakingOff({ ...takingOff, cooked: true })}>
                              {t('cookedYes')}
                            </button>
                          </div>
                          <span className="field-hint">{t('cookedHint')}</span>
                        </fieldset>
                      ) : null}
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {canManage && live.length > 0 && !moving && !paying ? (
              <button type="button" className="tb-edit-link" aria-pressed={editing} disabled={busy || takingOff !== null} onClick={() => setEditing((on) => !on)}>
                {editing ? t('doneTakingOff') : t('takeOffDish')}
              </button>
            ) : null}
            {/* Jira GRW-724 — the service charge, its own named line; added only when the guest agrees, removable until paid. */}
            {charge ? (
              <div className="tb-sc">
                <span className="tb-line-name">{charge.name}</span>
                <span className="tb-line-amount">{money(Number(charge.paidMinor ?? 0))}</span>
                <button type="button" className="btn btn-ghost" disabled={busy || takingOff !== null} onClick={() => void run(() => api.setBillServiceCharge(saleId, false))}>
                  {t('serviceChargeRemove')}
                </button>
              </div>
            ) : offerBp !== null && !waiter && live.length > 0 ? (
              <div className="tb-sc">
                <span className="tb-line-name">
                  {t('serviceChargeRow', { rate: offerBp / 100 })}
                  <span className="tb-off">{t('serviceChargeHint')}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={t('serviceChargeAdd', { rate: offerBp / 100 })}
                  disabled={busy || takingOff !== null}
                  onClick={() => void run(() => api.setBillServiceCharge(saleId, true))}
                >
                  {t('serviceChargeAddShort')}
                </button>
              </div>
            ) : null}

            {moving ? (
              moveBlock
            ) : live.length > 0 && !paying ? (
              <div className="tb-actions">
                <button type="button" className="btn btn-ghost" disabled={busy || takingOff !== null} onClick={onAddDishes}>
                  {t('addDishes')}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy || takingOff !== null} onClick={openMove}>
                  {t('moveTable')}
                </button>
                {waiter ? null : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy || takingOff !== null || printer.status.state === 'printing'}
                    onClick={() => void run(() => printer.printBill(saleId))}
                  >
                    {t('printBill')}
                  </button>
                )}
              </div>
            ) : null}

            <div className="tb-foot">
              {error ? (
                <p className="al-error" role="alert">
                  {error}
                </p>
              ) : null}
              <p className="tb-total">
                <span>{t('total')}</span>
                <strong>{money(totalMinor)}</strong>
              </p>
              {/* Taking a dish off: its two buttons take Take payment's place, so the sheet keeps its height and they stay
                  under the thumb (owner, 17 Nov). The reason itself is typed under the dish. */}
              {takingOff ? (
                <div className="tb-foot-pair">
                  <button
                    type="submit"
                    form="tb-reason-form"
                    className="btn btn-danger"
                    disabled={busy || takingOff.reason.trim() === '' || (takingOff.askCooked === true && takingOff.cooked === undefined)}
                  >
                    {t('takeOffNamed', { name: takingOff.name })}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setTakingOff(null)}>
                    {t('cancel')}
                  </button>
                </div>
              ) : moving ? null : live.length === 0 ? (
                <div className="tb-actions">
                  <p className="field-hint">{t('nothingLeft')}</p>
                  <button type="button" className="btn" disabled={busy} onClick={() => void run(() => api.cancelPendingCounterSale(saleId), 'done', t('closedOk', { table: table.name }))}>
                    {t('closeTable')}
                  </button>
                </div>
              ) : paying ? (
                <div className="tb-pay">
                  {anonymous ? (
                    <label className="dt-field">
                      <span className="field-hint">{t('guestName')}</span>
                      <input type="text" aria-label={t('guestName')} value={guestName} maxLength={60} autoComplete="off" onChange={(e) => setGuestName(e.target.value)} />
                    </label>
                  ) : null}
                  <div className="tb-modes" role="group" aria-label={t('howPaid')}>
                    {MODES.map((m) => (
                      <button key={m} type="button" className="btn" disabled={busy} onClick={() => void pay(m)}>
                        {t(`modes.${m}`)}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => setPaying(false)}>
                    {t('cancel')}
                  </button>
                </div>
              ) : waiter && !table.openBill?.billPrinted ? (
                <p className="field-hint tb-wait-bill">{t('waiterAskBill')}</p>
              ) : (
                <button type="button" className="btn tb-take-pay" disabled={busy} onClick={() => (onTakePayment ? onTakePayment() : setPaying(true))}>
                  {t('takePayment', { amount: money(totalMinor) })}
                </button>
              )}
            </div>
          </>
        ) : error && !seatedOnly ? (
          <p className="al-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
