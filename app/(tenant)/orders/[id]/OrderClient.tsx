'use client';

import { useCallback, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api, ApiError, formatMoney } from '../../lib/api';
import type { OrderDetail, ReturnSaleProductsResponse } from '../../lib/api-types';
import { PageHeader } from '../../components/PageHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DocumentAction } from '../../components/DocumentAction';
import { ReturnProductSheet, type ReturnableSaleBill } from '../../sales/ReturnProductSheet';
import { KNOWN_STATES } from '../../lib/orders-filter';
import { useAreas, useSession, useWritable } from '../../components/SessionProvider';
import { computeReturnWindow } from '../../sales/sales-helpers';
import { returnReasonKey } from '../../lib/return-reasons';
import { intlLocale } from '../../lib/format';
import { SwapSizeSheet } from './SwapSizeSheet';
import { AttachClientSheet } from './AttachClientSheet';
import { OrderMarketplaceLine } from './OrderMarketplaceLine';
import { useNouns } from '../../lib/use-nouns';

/**
 * Jira GRW-615 — an order's own screen.
 *
 * One column, laid out at 344px: who it is for, then the items, then the money, then what happened. The next move is ONE
 * full-width button in a bar that stays above the bottom nav — reachable with a thumb while holding a parcel — and the
 * rarer moves (cancel, came back) sit behind a quiet "More" with plain names.
 *
 * What it offers comes from the API (`order.moves`, computed from the state machine), never from here (BR-01): this
 * component has no list of what can follow what, and so cannot disagree with the server about it. A tap sends the state
 * the screen BELIEVES the order is in, so an order moved on another device is refused with a sentence and the screen
 * redraws from the truth — AC-02. The button is disabled while its request is out, so a double tap moves the order once.
 *
 * Nothing animates: the state chip simply changes (UX-08).
 */
/** "Shirt (28)" → "28": a sized line's name carries its size in the last brackets, so a note on the line can say just which. */
const sizeIn = (name: string): string => /\(([^()]*)\)\s*$/.exec(name)?.[1] ?? name;

export function OrderClient({
  id,
  initial,
  timezone,
  returnWindowDays,
}: {
  id: string;
  /** Null when the first read failed: the screen shows the retry instead of a blank page. */
  initial: OrderDetail | null;
  timezone: string;
  returnWindowDays: number;
}) {
  const t = useTranslations('orders');
  const locale = useLocale();
  const writable = useWritable();
  // Restaurant QA 2026-10-24 — who the order is for, in the business's word (Guest, Customer).
  const nouns = useNouns();
  const session = useSession();
  // A kitchen keeps no count, so the API answers `restocked: false` for every return for want of a shelf: saying so
  // on the order would read as a write-off of a dish nobody wrote off.
  const counted = useAreas().stock;

  const [order, setOrder] = useState<OrderDetail | null>(initial);
  const [failed, setFailed] = useState(initial === null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // QA 2026-10-23 — a move that cannot be taken back is asked about first. "Cancel this order" fired on one tap from the
  // More menu; cancelled and came back are final states, nothing moves an order out of them.
  const [confirming, setConfirming] = useState<'cancelled' | 'returned' | null>(null);
  // QA 2026-10-23 — what came back can be sold again (back on the shelf) or not (kept off it): asked with "came back", where there is a shelf.
  const [saleable, setSaleable] = useState(true);
  const [returning, setReturning] = useState(false);
  // Jira GRW-617 — the line whose size is being swapped.
  const [swapping, setSwapping] = useState<string | null>(null);
  // Jira GRW-613 — "This is a client of ours", for a buyer the shop recognises.
  const [attaching, setAttaching] = useState(false);
  // One move at a time, however fast the button is tapped. `busy` is state and so is stale until the next render: two taps
  // inside the same frame both saw it false, and the second went out with the old state and was refused as "moved on" —
  // a refusal of the person's OWN first tap (found in the browser). A ref is what the second tap reads.
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setOrder(await api.order(id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id]);

  // Typed lookups, not `t(`..${x}`)`: the message keys are checked, and a key that does not exist cannot compile.
  const stateWords: Record<(typeof KNOWN_STATES)[number], string> = {
    done: t('states.done'),
    new: t('states.new'),
    packed: t('states.packed'),
    sent: t('states.sent'),
    delivered: t('states.delivered'),
    cancelled: t('states.cancelled'),
    returned: t('states.returned'),
  };
  const stateWord = (s: string): string => stateWords[s as keyof typeof stateWords] ?? t('list.unknownState');
  const channelWords: Record<string, string> = { counter: t('channels.counter'), flipkart: t('channels.flipkart'), amazon: t('channels.amazon') };
  const channelWord = (c: string): string => channelWords[c] ?? c;
  const moveWords: Record<string, string> = {
    packed: t('detail.moves.packed'),
    sent: t('detail.moves.sent'),
    delivered: t('detail.moves.delivered'),
    cancelled: t('detail.moves.cancelled'),
    returned: t('detail.moves.returned'),
  };
  const confirmWords = {
    cancelled: {
      title: t('detail.confirmMove.cancelled.title'),
      body: t('detail.confirmMove.cancelled.body'),
      confirm: t('detail.confirmMove.cancelled.confirm'),
      keep: t('detail.confirmMove.cancelled.keep'),
    },
    returned: {
      title: t('detail.confirmMove.returned.title'),
      body: t('detail.confirmMove.returned.body'),
      confirm: t('detail.confirmMove.returned.confirm'),
      keep: t('detail.confirmMove.returned.keep'),
      question: t('detail.confirmMove.returned.saleableQuestion'),
      yes: t('detail.confirmMove.returned.saleableYes'),
      no: t('detail.confirmMove.returned.saleableNo'),
    },
  };
  const modeWords: Record<string, string> = { cash: t('detail.modes.cash'), card: t('detail.modes.card'), upi: t('detail.modes.upi'), other: t('detail.modes.other') };

  const when = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso));
  // Jira GRW-637 — "Flipkart refunded ₹450 on 12 May": the marketplace's name as the owner reads it, and the day in the shop's own timezone.
  const refundChannelWord = (c: string) => (c === 'flipkart' ? t('refunds.flipkart') : c === 'amazon' ? t('refunds.amazon') : c.charAt(0).toUpperCase() + c.slice(1));
  const refundDay = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: timezone }).format(new Date(iso));
  const money = (minor: string | number | undefined): string | null => (minor === undefined ? null : formatMoney(minor, 'INR', locale));

  /** A tap on a move: the two final ones are asked about first, the rest go straight through. */
  const ask = (to: string) => {
    if (to === 'cancelled' || to === 'returned') {
      setMoreOpen(false);
      setConfirming(to);
      return;
    }
    void move(to);
  };

  const move = async (to: string, extra: { saleable?: boolean } = {}) => {
    if (!order || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    setMoreOpen(false);
    try {
      const moved = await api.moveOrder(order.id, to, order.status, extra);
      const back = moved.cameBack;
      if (back?.detail) setNotice(t('detail.cameBackResult.notRecorded', { reason: back.detail }));
      else if (back?.recorded && back.units > 0) setNotice(extra.saleable === false ? t('detail.cameBackResult.writtenOff', { count: back.units }) : t('detail.cameBackResult.back', { count: back.units }));
      await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'move_not_allowed') {
        // The order is not where this screen thought: say where it is now, and redraw from the truth (AC-02).
        const now = (error.body as { status?: string } | undefined)?.status ?? order.status;
        setNotice(t('detail.movedOn', { state: stateWord(now) }));
        await refresh();
      } else {
        setNotice(t('detail.moveFailed'));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (failed || !order) {
    return (
      <>
        <PageHeader title={t('list.orderCode', { code: id.slice(0, 8).toUpperCase() })} />
        <div className="page-body ord-page">
          <div className="ord-state" role="alert">
            <p>{t('detail.loadError')}</p>
            <button type="button" className="btn" onClick={() => void refresh()}>
              {t('list.error.retry')}
            </button>
          </div>
        </div>
      </>
    );
  }

  const code = order.id.slice(0, 8).toUpperCase();
  const isCounter = order.channel === 'counter';
  const hasMoney = order.totalMinor !== undefined;
  const offerPrimary = writable && order.moves.primary !== null && moveWords[order.moves.primary] !== undefined;
  const more = writable ? order.moves.more.filter((m) => moveWords[m] !== undefined) : [];
  const hasBar = offerPrimary || more.length > 0;
  // The server says who may swap (the very function that would refuse it); the screen also holds it while the business is read-only.
  const canSwap = writable && order.canSwap;
  const swapLine = swapping ? order.lines.find((l) => l.id === swapping) : undefined;
  const soldDayISO = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(order.soldAt));
  const windowExpired = !computeReturnWindow(soldDayISO, new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()), returnWindowDays).eligible;
  const isOwner = !session || session.role === null || session.role === 'owner';
  // An online order that is still to send and has nowhere to go says so, plainly, instead of showing an empty block.
  const toSend = order.status === 'new' || order.status === 'packed';
  const noAddress = !isCounter && toSend && !order.buyer?.address;

  const returnable: ReturnableSaleBill | null =
    isCounter && hasMoney && order.lines.every((l) => l.priceMinor !== undefined)
      ? {
          key: order.id,
          startAt: order.soldAt,
          dayISO: new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(order.soldAt)),
          locationId: order.locationId,
          clientName: order.client?.name ?? order.buyer?.name ?? '',
          clientPhone: null,
          products: order.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            // A sized line is named by its own id (lineReturnId), which needs the size here: without it a sized line was named by its
            // product and the server refused it — and after a swap the old and new lines would have shared that one id.
            variantId: l.variantId,
            name: l.name,
            priceMinor: l.priceMinor!,
            qty: l.qty,
            returnedQty: l.returnedQty,
            paidMinor: l.paidMinor!,
            returnedMinor: l.returnedMinor,
            sku: l.sku,
            barcode: l.barcode,
          })),
          totalMinor: order.totalMinor!,
          paymentModes: order.payments?.map((p) => p.mode),
        }
      : null;

  return (
    <>
      <PageHeader title={t('list.orderCode', { code })} />
      <div className={`page-body ord-page ord-detail ${hasBar ? 'has-bar' : ''}`} aria-busy={busy || undefined}>
        <section className="ord-d-head">
          <span className={`ord-state-chip ord-s-${order.known ? order.status : 'unknown'}`}>{stateWord(order.status)}</span>
          <span className="ord-d-meta">
            {when(order.soldAt)} · {channelWord(order.channel)}
            {order.externalRef ? ` · ${order.externalRef}` : ''}
          </span>
        </section>

        {!isCounter ? (
          <OrderMarketplaceLine
            orderId={order.id}
            channel={channelWord(order.channel)}
            messages={order.marketplace}
            canRetry={order.canRetryMarketplace === true}
            timezone={timezone}
            onChanged={() => void refresh()}
          />
        ) : null}

        {!isCounter && order.branchName ? <p className="ord-d-quiet ord-d-branch">{t('detail.bookedAt', { branch: order.branchName })}</p> : null}

        {notice ? (
          <p className="ord-d-notice" role="alert">
            {notice}
          </p>
        ) : null}

        <section className="ord-d-block" aria-label={t('detail.forTitle')}>
          <h2>{order.client ? t('detail.client', { customer: nouns.Customer }) : t('buyer.title')}</h2>
          {order.client ? <p className="ord-d-name">{order.client.name ?? t('list.noName')}</p> : null}
          {order.buyer ? (
            <>
              {!order.client ? <p className="ord-d-name">{order.buyer.name ?? t('list.noName')}</p> : null}
              {!order.client ? <p className="ord-d-quiet">{t('buyer.notAClient')}</p> : null}
              {/*
                Jira GRW-613 — the buyer is somebody the shop already knows. Offered only where it can do anything:
                a buyer with no client yet, and a role the API would accept (`useWritable` carries the business's
                read-only state and the role grid's). Never matched for them (BR-02) — the sheet is a search.
              */}
              {!order.client && writable ? (
                <button type="button" className="ord-d-attach" onClick={() => setAttaching(true)}>
                  {t('attach.action')}
                </button>
              ) : null}
              {order.buyer.address ? (
                <p className="ord-d-address">
                  <span className="ord-d-label">{t('detail.address')}</span>
                  {order.buyer.address}
                </p>
              ) : null}
              {order.buyer.contact ? (
                <p className="ord-d-address">
                  <span className="ord-d-label">{t('detail.contact')}</span>
                  {order.buyer.contact}
                </p>
              ) : null}
            </>
          ) : order.buyerRedactedAt ? (
            <p className="ord-d-quiet">{t('detail.detailsRemoved')}</p>
          ) : null}
          {noAddress ? <p className="ord-d-warn">{t('detail.noAddress')}</p> : null}
        </section>

        <section className="ord-d-block" aria-label={t('detail.itemsTitle')}>
          <h2>{t('detail.itemsTitle')}</h2>
          {order.lines.length === 0 ? (
            <p className="ord-d-warn">{t('detail.noLines')}</p>
          ) : (
            <ul className="ord-d-lines">
              {order.lines.map((l) => (
                <li key={l.id}>
                  <span className="ord-d-line-name">
                    {l.name}
                    {l.returnedQty - l.swappedQty > 0 ? <span className="ord-d-quiet"> · {t('detail.cameBack', { count: l.returnedQty - l.swappedQty })}</span> : null}
                    {l.swappedQty > 0 ? <span className="ord-d-quiet"> · {t('detail.swap.swapped', { count: l.swappedQty })}</span> : null}
                    {l.swappedFromId ? <span className="ord-d-quiet"> · {t('detail.swap.swappedFrom', { name: sizeIn(order.lines.find((o) => o.id === l.swappedFromId)?.name ?? '') })}</span> : null}
                  </span>
                  <span className="ord-d-line-qty">{t('detail.times', { count: l.qty })}</span>
                  {l.paidMinor !== undefined ? <span className="ord-d-line-amount">{money(l.paidMinor)}</span> : null}
                  {canSwap && l.swappable ? (
                    <button type="button" className="btn ord-d-line-swap" onClick={() => setSwapping(l.id)}>
                      {t('detail.swap.action')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {(order.returns ?? []).length > 0 ? (
          <section className="ord-d-block" aria-label={t('detail.returnsTitle')}>
            <h2>{t('detail.returnsTitle')}</h2>
            <ul className="ord-d-lines">
              {(order.returns ?? []).map((r) => (
                <li key={`${r.at}-${r.kind}-${r.reasonCode ?? ''}-${r.units}`}>
                  <span className="ord-d-line-name">
                    {r.kind === 'undelivered' ? t('detail.undelivered') : t('detail.customerReturn')}
                    {r.kind === 'customer' ? <span className="ord-d-quiet"> · {t(`returnReasons.${returnReasonKey(r.reasonCode)}`)}</span> : null}
                    {r.reasonText && r.reasonCode === 'other' ? <span className="ord-d-quiet"> · {r.reasonText}</span> : null}
                    {counted && !r.restocked ? <span className="ord-d-quiet"> · {t('detail.notRestocked')}</span> : null}
                    {r.saleableDefaulted ? <span className="ord-d-quiet"> · {t('detail.saleableAssumed')}</span> : null}
                  </span>
                  <span className="ord-d-line-qty">{t('detail.times', { count: r.units })}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {(order.refunds ?? []).length > 0 ? (
          <section className="ord-d-block" aria-label={t('detail.refundsTitle')}>
            <h2>{t('detail.refundsTitle')}</h2>
            <ul className="ord-d-lines">
              {(order.refunds ?? []).map((f) => (
                <li key={f.id}>
                  <span className="ord-d-line-name">
                    {f.refundedBy === 'marketplace' ? t('detail.marketplaceRefunded', { channel: refundChannelWord(f.channel), date: refundDay(f.refundedAt) }) : t('detail.shopRefunded', { date: refundDay(f.refundedAt) })}
                    {order.lines.find((l) => l.id === f.lineId)?.name ? <span className="ord-d-quiet"> · {order.lines.find((l) => l.id === f.lineId)?.name}</span> : null}
                    <span className="ord-d-quiet"> · {t('detail.refundRef', { ref: f.externalRef })}</span>
                  </span>
                  <span className="ord-d-line-qty" aria-hidden="true" />
                  <span className="ord-d-line-amount">{money(f.amountMinor)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasMoney ? (
          <section className="ord-d-block" aria-label={t('detail.moneyTitle')}>
            <h2>{t('detail.moneyTitle')}</h2>
            <dl className="ord-d-money">
              <div>
                <dt>{t('detail.total')}</dt>
                <dd>{money(order.totalMinor)}</dd>
              </div>
              {order.refundedMinor ? (
                <div>
                  <dt>{t('detail.givenBack')}</dt>
                  <dd>{money(order.refundedMinor)}</dd>
                </div>
              ) : null}
              {(order.payments ?? []).map((p) => (
                <div key={p.mode}>
                  <dt>{t('detail.paidBy', { mode: modeWords[p.mode] ?? p.mode })}</dt>
                  <dd>{money(p.amountMinor)}</dd>
                </div>
              ))}
            </dl>
            <div className="ord-d-paper">
              <DocumentAction visitKey={order.id} />
              {returnable && writable ? (
                <button type="button" className="btn" onClick={() => setReturning(true)}>
                  {t('detail.returnItems')}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="ord-d-block" aria-label={t('detail.historyTitle')}>
          <h2>{t('detail.historyTitle')}</h2>
          <ol className="ord-d-history">
            <li>
              <span>{order.channel === 'counter' ? t('detail.placedCounter') : t('detail.placed', { channel: channelWord(order.channel) })}</span>
              <span className="ord-d-quiet">{when(order.soldAt)}</span>
            </li>
            {order.history.map((h, i) => (
              <li key={i}>
                <span>
                  {h.kind === 'status_change'
                    ? t('detail.movedTo', { state: stateWord(h.to ?? '') })
                    : h.kind === 'client_attached'
                      ? t('detail.clientAttached', { customer: nouns.customer })
                      : h.kind === 'exchange'
                        ? t('detail.swap.history', { from: h.from ?? '', to: h.to ?? '' })
                        : t('detail.buyerErased')}
                  {h.by ? <span className="ord-d-quiet"> · {t('detail.by', { name: h.by })}</span> : null}
                </span>
                <span className="ord-d-quiet">{when(h.at)}</span>
              </li>
            ))}
          </ol>
        </section>

        {hasBar ? (
          <div className="ord-d-bar">
            {moreOpen && more.length > 0 ? (
              <ul className="ord-d-more" role="menu">
                {more.map((m) => (
                  <li key={m} role="none">
                    <button type="button" role="menuitem" className="ord-d-more-item" disabled={busy} onClick={() => ask(m)}>
                      {moveWords[m]}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="ord-d-bar-row">
              {more.length > 0 ? (
                <button type="button" className="btn ord-d-more-btn" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                  {t('detail.more')}
                </button>
              ) : null}
              {offerPrimary ? (
                <button type="button" className="btn btn-primary ord-d-primary" disabled={busy} onClick={() => ask(order.moves.primary!)}>
                  {moveWords[order.moves.primary!]}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {confirming ? (
        <ConfirmDialog
          title={confirmWords[confirming].title}
          body={confirmWords[confirming].body}
          confirmLabel={confirmWords[confirming].confirm}
          cancelLabel={confirmWords[confirming].keep}
          tone="danger"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const to = confirming;
            setConfirming(null);
            void move(to, to === 'returned' && counted ? { saleable } : {});
          }}
        >
          {confirming === 'returned' && counted ? (
            <fieldset className="ord-d-saleable">
              <legend>{confirmWords.returned.question}</legend>
              <label>
                <input type="radio" name="saleable" checked={saleable} onChange={() => setSaleable(true)} />
                {confirmWords.returned.yes}
              </label>
              <label>
                <input type="radio" name="saleable" checked={!saleable} onChange={() => setSaleable(false)} />
                {confirmWords.returned.no}
              </label>
            </fieldset>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {attaching && order.buyer ? (
        <AttachClientSheet
          orderId={order.id}
          buyerName={order.buyer.name}
          buyerContact={order.buyer.contact}
          locationId={order.locationId}
          onClose={() => setAttaching(false)}
          onAttached={() => {
            setAttaching(false);
            void refresh();
          }}
        />
      ) : null}

      {swapLine ? (
        <SwapSizeSheet
          order={order}
          line={swapLine}
          isOwner={isOwner}
          windowExpired={windowExpired}
          windowDays={returnWindowDays}
          onClose={() => setSwapping(null)}
          onSwapped={() => {
            setSwapping(null);
            void refresh();
          }}
          // A swap whose answer was lost may have happened: redraw from the server so the sheet never offers units already swapped.
          onUnsure={() => void refresh()}
        />
      ) : null}

      {returning && returnable ? (
        <ReturnProductSheet
          bills={[returnable]}
          initialBill={returnable}
          timezone={timezone}
          todayISO={new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())}
          returnWindowDays={returnWindowDays}
          onClose={() => setReturning(false)}
          onReturned={(_res: ReturnSaleProductsResponse) => {
            setReturning(false);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}
