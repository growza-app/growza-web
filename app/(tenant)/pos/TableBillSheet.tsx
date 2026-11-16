'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, formatMoney, type DiningArea, type DiningTable, type OrderDetail } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';
import { useScrimDismiss } from '../../shared/a11y/scrim-dismiss';
import type { useTicketPrinter } from '../components/TicketPrinter';

/**
 * Jira GRW-721 — one table's running bill: what it has had, what it comes to, and the four things a counter does with
 * it — add a round, print the bill, take payment, and (owner or manager) take a dish off. A table with nothing left on
 * it closes without a bill (BR-05).
 *
 * Every action answers from the server and the sheet reads the bill again, so two counters on one table see one bill.
 * Jira GRW-722 — "Move table" lists the branch's other tables: a free one takes the party (Move here), a busy one takes
 * this bill onto its own (Join). Nothing is sent to the kitchen again; the server refuses either once money was taken.
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
  /** Closed, paid, or dismissed — the map reads again, and says what happened when something did. */
  onDone: (said?: string) => void;
}) {
  const t = useTranslations('posTables');
  const saleId = table.openBill!.saleId;
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose: () => onDone(), initialFocus: 'container' });
  const scrimDismiss = useScrimDismiss(() => onDone());
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [takingOff, setTakingOff] = useState<{ lineId: string; name: string; reason: string } | null>(null);
  /** Move table: the room as it is now (null = not open; [] while it loads). */
  const [moving, setMoving] = useState<DiningArea[] | null>(null);

  const openMove = () =>
    void run(async () => {
      setMoving([]);
      setMoving((await api.diningTables(location)).areas);
    });
  const moveTo = (to: DiningTable) =>
    run(
      () => (to.openBill ? api.joinTable(table.id, to.id) : api.moveTable(table.id, to.id)),
      'done',
      to.openBill ? t('joinedOk', { from: table.name, to: to.name }) : t('movedOk', { from: table.name, to: to.name }),
    );

  const read = useCallback(async () => {
    try {
      setOrder(await api.order(saleId));
    } catch {
      setError(t('billLoadFailed'));
    }
  }, [saleId, t]);
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

  const money = (minor: number | string | undefined) => formatMoney(String(minor ?? 0));
  const live = (order?.lines ?? []).filter((l) => !l.cancelReason && l.qty > l.returnedQty);
  const totalMinor = (order?.lines ?? []).reduce((n, l) => n + Number(l.paidMinor ?? 0) - Number(l.returnedMinor ?? 0), 0);
  const anonymous = !order?.client || /^walk-in$/i.test(order.client.name ?? '');

  const pay = (mode: (typeof MODES)[number]) =>
    run(async () => {
      if (anonymous) {
        const name = guestName.trim();
        if (!name) throw new ApiError(400, t('guestNeeded'));
        await api.assignClientToSale(saleId, { name });
      }
      await api.settleCounterSale(saleId, { paymentMode: mode });
    }, 'done', t('paidOk', { table: table.name, amount: money(totalMinor) }));

  return (
    <div className="pf-keypad-scrim" {...scrimDismiss}>
      <div ref={ref} className="pf-keypad tb-sheet" role="dialog" aria-modal="true" aria-label={`${table.name} · ${areaName}`} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">
            {table.name} · {areaName}
          </span>
          <button type="button" className="pf-keypad-clear" onClick={() => onDone()}>
            {t('close')}
          </button>
        </div>

        {order === null && !error ? <p className="field-hint">{t('loading')}</p> : null}
        {order ? (
          <>
            <ul className="tb-lines">
              {order.lines.map((l) => (
                <li key={l.id} className={`tb-line${l.cancelReason ? ' is-off' : ''}`}>
                  <span className="tb-line-name">
                    {l.qty} × {l.name}
                    {l.cancelReason ? <span className="tb-off">{t('takenOff', { reason: l.cancelReason })}</span> : null}
                  </span>
                  <span className="tb-line-amount">{money(Number(l.paidMinor ?? 0) - Number(l.returnedMinor ?? 0))}</span>
                  {canManage && !l.cancelReason ? (
                    <button type="button" className="btn btn-ghost tb-off-btn" disabled={busy} onClick={() => setTakingOff({ lineId: l.id, name: l.name, reason: '' })}>
                      {t('takeOff')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="tb-total">
              <span>{t('total')}</span>
              <strong>{money(totalMinor)}</strong>
            </p>

            {takingOff ? (
              <form
                className="tb-reason"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => api.cancelBillItems(saleId, [takingOff.lineId], takingOff.reason)).then(() => setTakingOff(null));
                }}
              >
                <label className="dt-field">
                  <span className="field-hint">{t('whyOff', { name: takingOff.name })}</span>
                  <input type="text" aria-label={t('whyOff', { name: takingOff.name })} value={takingOff.reason} maxLength={200} onChange={(e) => setTakingOff({ ...takingOff, reason: e.target.value })} />
                </label>
                <div className="dt-actions">
                  <button type="submit" className="btn btn-danger" disabled={busy || takingOff.reason.trim() === ''}>
                    {t('takeOff')}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setTakingOff(null)}>
                    {t('cancel')}
                  </button>
                </div>
              </form>
            ) : null}

            {moving ? (
              <div className="tb-move" role="group" aria-label={t('moveTitle', { table: table.name })}>
                <p className="field-hint">{t('moveHint')}</p>
                {moving.length === 0 ? <p className="field-hint">{t('loading')}</p> : null}
                {moving.map((area) => {
                  const others = area.tables.filter((x) => x.id !== table.id);
                  return others.length === 0 ? null : (
                    <section key={area.id} className="tb-move-area">
                      <h3 className="tb-move-name">{area.name}</h3>
                      <div className="tb-move-grid">
                        {others.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            className={`tm-tile ${x.openBill ? 'is-ordering' : 'is-free'}`}
                            disabled={busy}
                            aria-label={x.openBill ? t('joinTo', { table: x.name, amount: money(x.openBill.totalMinor) }) : t('moveTo', { table: x.name })}
                            onClick={() => void moveTo(x)}
                          >
                            <span className="tm-name">{x.name}</span>
                            <span className="tm-state">{x.openBill ? t('join') : t('moveHere')}</span>
                            {x.openBill ? <span className="tm-detail">{money(x.openBill.totalMinor)}</span> : null}
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
                <button type="button" className="btn btn-ghost" onClick={() => setMoving(null)}>
                  {t('cancel')}
                </button>
              </div>
            ) : live.length === 0 ? (
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
            ) : (
              <div className="tb-actions">
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={onAddDishes}>
                  {t('addDishes')}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={openMove}>
                  {t('moveTable')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || printer.status.state === 'printing'}
                  onClick={() => void run(() => printer.printBill(saleId))}
                >
                  {t('printBill')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setPaying(true)}>
                  {t('takePayment', { amount: money(totalMinor) })}
                </button>
              </div>
            )}
          </>
        ) : null}
        {error ? (
          <p className="al-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
