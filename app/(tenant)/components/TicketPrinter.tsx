'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError } from '../lib/api';
import type { KitchenTicketDto, OrderType } from '../lib/api-types';
import { intlLocale, formatMoney } from '../lib/format';
import { billFromDocument, kotFromApi } from '../lib/print/from-api';
import { logoBitmap, qrPictureBitmap } from '../lib/print/picture';
import { encodeQr, qrBitmap } from '../lib/print/qr';
import { bluetoothSupported, forgetPrinter } from '../lib/print/bluetooth';
import {
  DEFAULT_PRINTER,
  pairPrinter,
  printTicket,
  PrinterError,
  readPrinterSettings,
  savePrinterSettings,
  settingsForStation,
  stationKey,
  type PrinterSettings,
  type StationRoute,
} from '../lib/print/printer';
import { billTicket, kotTicket, type BillData, type Ticket } from '../lib/print/ticket';
import { useSession } from './SessionProvider';
import { useBranch } from './BranchProvider';
import { IconPrint } from './icons';
import { MenuKebab } from '../products/MenuKebab';

/**
 * Jira GRW-713 — the till's printer: the KOT for the kitchen, the bill for the guest.
 *
 * One hook every screen that takes an order uses, so the POS, the queue and the order screen print the same paper
 * and say the same thing when it does not come out. A print never stops a sale (story BR-03): it runs after the
 * order is safely on the server, and a failure is a line with Try again beside it, never a dialog over the till.
 */

export type PrintStatus =
  | { state: 'idle' }
  | { state: 'printing' }
  | { state: 'done' }
  /** The job had nothing on it — an order the kitchen was never sent (one from before KOTs existed). Said, not "Printed". */
  | { state: 'nothing'; message: string }
  /** Jira GRW-733 — `again`: the retry is "Print again" for the slips that did not come out ("Bar slip did not print"). */
  | { state: 'failed'; message: string; retry: () => void; again?: boolean };

/** Thrown by a job with nothing to print, so the line can say why instead of claiming it printed. */
class NothingToPrint extends Error {}

/**
 * One ticket to print. Jira GRW-733 — `settings`: the printer it comes out of (absent: this device's own; null: not from
 * this device — its station prints elsewhere); `station`: the kitchen station it is for, named when it does not print.
 */
interface PrintJob {
  ticket: Ticket;
  copies: number;
  settings?: PrinterSettings | null;
  station?: string | null;
}

export interface OrderRef {
  tokenNo: number | null;
  /** Jira GRW-716 — an order taken offline: its till's token ("A12"). */
  offlineToken?: string | null;
  channel: string | null;
  /** Jira GRW-720 · GRW-719 — how it is eaten, and its table: printed on the slip. */
  orderType?: OrderType | null;
  tableName?: string | null;
}

export function useTicketPrinter() {
  const t = useTranslations('print');
  const tDoc = useTranslations('documents');
  const tPay = useTranslations('chrome.pay');
  const locale = useLocale();
  const session = useSession();
  const timezone = session?.timezone ?? 'Asia/Kolkata';
  const [settings, setSettingsState] = useState<PrinterSettings>(DEFAULT_PRINTER);
  const [status, setStatus] = useState<PrintStatus>({ state: 'idle' });

  // Read after mount: the server render knows nothing of this device's printer.
  useEffect(() => setSettingsState(readPrinterSettings()), []);

  const setSettings = useCallback((next: PrinterSettings) => {
    setSettingsState(next);
    savePrinterSettings(next);
  }, []);

  const kotWhen = useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso)),
    [locale, timezone],
  );

  const kotCopy = useCallback(
    () => ({
      title: t('kotTitle'),
      added: t('kotAdded'),
      cancelled: t('kotCancelled'),
      packed: t('kotPacked'),
      reprint: t('reprint'),
      kotNo: (n: number) => t('kotNo', { n }),
      token: (n: number | string) => t('token', { n }),
      items: (n: number) => t('items', { n }),
      by: (name: string) => t('kotBy', { name }),
    }),
    [t],
  );


  /** Jira GRW-720 — "TAKEAWAY", "DINE-IN · T4" on the slip; plain case on the bill. */
  const typeWords = useCallback(
    (loud: boolean) => (type: OrderType, table: string | null) => {
      const word = type === 'dine_in' ? t('typeDineIn') : type === 'takeaway' ? t('typeTakeaway') : t('typeDelivery');
      const said = loud ? word.toLocaleUpperCase() : word;
      return table ? `${said} · ${table}` : said;
    },
    [t],
  );

  /**
   * Jira GRW-733 — the slips of an order, each with where it comes out from this device: its station's printer, this
   * device's own, or not from here (`settings` null). A branch with no stations has one slip, on this device's printer.
   */
  const kotJobs = useCallback(
    (kots: readonly KitchenTicketDto[], order: OrderRef, reprint: boolean): PrintJob[] => {
      const device = readPrinterSettings();
      return kots.map((k) => ({
        ticket: kotTicket(kotFromApi(k, order, kotWhen, reprint, typeWords(true)), kotCopy()),
        copies: 1,
        settings: settingsForStation(device, k.stationId),
        station: k.station ?? null,
      }));
    },
    [kotWhen, kotCopy, typeWords],
  );

  /** The bill's words, in the screen's language. */
  const billCopy = useCallback(
    () => ({
      reprint: t('reprint'),
      phone: (v: string) => t('phone', { v }),
      gstin: (v: string) => t('gstin', { v }),
      fssai: (v: string) => t('fssai', { v }),
      name: (v: string) => t('name', { v }),
      date: (v: string) => t('date', { v }),
      cashier: (v: string) => t('cashier', { v }),
      billNo: (v: string) => t('billNo', { v }),
      token: (n: number | string) => t('token', { n }),
      colItem: t('colItem'),
      colQty: t('colQty'),
      colPrice: t('colPrice'),
      colAmount: t('colAmount'),
      totalQty: (n: number) => t('totalQty', { n }),
      subTotal: t('subTotal'),
      roundOff: t('roundOff'),
      grandTotal: t('grandTotal'),
      thanks: t('thanks'),
    }),
    [t],
  );

  /**
   * Print, saying what happened. `job` builds the ticket(s); a failure keeps `job` for Try again.
   *
   * Jira GRW-733 — a station's slip that does not come out (its printer is off, out of reach) never stops the others: each
   * prints in turn, and the line says which did not ("Bar slip did not print") with Print again for those alone. The order
   * is already saved and the station's screen already shows it (AC-02).
   */
  const run = useCallback(
    async (job: () => Promise<PrintJob[]>) => {
      const attempt = async (only?: PrintJob[]): Promise<void> => {
        setStatus({ state: 'printing' });
        try {
          const current = readPrinterSettings();
          const tickets = only ?? (await job());
          if (tickets.length === 0) throw new NothingToPrint();
          const here = tickets.filter((j) => j.settings !== null);
          if (here.length === 0) {
            setStatus({ state: 'nothing', message: t('slipsElsewhere') });
            return;
          }
          const missed: PrintJob[] = [];
          for (const j of here) {
            try {
              await printTicket(j.ticket, j.settings ?? current, j.copies);
            } catch (e) {
              // A slip for no station is the order's only slip: say it as before.
              if (!j.station) throw e;
              missed.push(j);
            }
          }
          if (missed.length > 0) {
            const names = [...new Set(missed.map((j) => j.station!))];
            setStatus({
              state: 'failed',
              message: names.length === 1 ? t('stationFailed', { station: names[0]! }) : t('stationsFailed', { stations: names.join(', ') }),
              retry: () => void attempt(missed),
              again: true,
            });
            return;
          }
          setStatus({ state: 'done' });
        } catch (e) {
          if (e instanceof NothingToPrint) {
            setStatus({ state: 'nothing', message: t('noKots') });
            return;
          }
          const message =
            e instanceof PrinterError && e.code === 'not_paired'
              ? t('notPaired')
              : e instanceof ApiError && e.status < 500
                ? t('billBlocked', { reason: e.message })
                : t('failed');
          setStatus({ state: 'failed', message, retry: () => void attempt(only) });
        }
      };
      await attempt();
    },
    [t],
  );

  /** The KOT(s) the order's change just returned — Jira GRW-733: one per station, each to its station's printer. */
  const printKot = useCallback(
    (kot: KitchenTicketDto | readonly KitchenTicketDto[], order: OrderRef, reprint = false) =>
      run(async () => kotJobs(Array.isArray(kot) ? kot : [kot as KitchenTicketDto], order, reprint)),
    [run, kotJobs],
  );

  /** Every KOT the order has had, printed again and marked REPRINT. */
  /**
   * Every KOT the order has had, read from the server — on the paid screen (owner, 2026-11-16: "Print KOT only after
   * payment") and, marked REPRINT, from the order screen.
   */
  const printOrderKots = useCallback(
    (saleId: string, reprint: boolean) =>
      run(async () => {
        const read = await api.saleKots(saleId);
        return kotJobs(read.tickets, read, reprint);
      }),
    [run, kotJobs],
  );
  const reprintKots = useCallback((saleId: string) => printOrderKots(saleId, true), [printOrderKots]);

  /**
   * The bill: the order's GST document, issued if it has not been (idempotent — the same number every time), laid
   * out for the roll. One numbering for every bill the business gives out, whether printed, sent or downloaded.
   */
  const billJobs = useCallback(
    async (saleId: string, reprint = false, held?: { couponCode?: string; discountMinor?: number }): Promise<PrintJob[]> => {
        const issued = await api.issueDocument(saleId, held);
        const doc = await api.documentTicket(issued.id);
        const figure = (minor: number) =>
          new Intl.NumberFormat(intlLocale(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
        const when = (iso: string) =>
          new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(iso)).replace(',', '');
        const data = billFromDocument(
          doc,
          {
            docTitle: (type) => {
              const word = tDoc(`type.${type}`);
              return word.charAt(0).toUpperCase() + word.slice(1);
            },
            paidBy: (ways) =>
              ways.length === 0
                ? null
                : t('paidBy', {
                    ways: ways
                      .map((w) => `${w.mode === 'cash' || w.mode === 'card' || w.mode === 'upi' || w.mode === 'other' ? tPay(w.mode) : w.mode}${w.amount ? ` ${w.amount}` : ''}`)
                      .join(' · '),
                  }),
            discount: t('discount'),
            points: (n) => t('points', { n }),
            orderType: typeWords(false),
            tax: (name, rate, included) =>
              rate === null ? name : t(included ? 'taxAtIncluded' : 'taxAt', { tax: name, rate: String(rate) }),
          },
          { figure, money: (minor) => formatMoney(minor, 'INR', locale), when },
          reprint,
        );
        const copy = billCopy();
        const device = readPrinterSettings();
        // Jira GRW-728 — the logo this bill was issued with, in this roll's dots; one that will not draw is left off.
        const logo = doc.supplier.logo ? await logoBitmap(doc.supplier.logo, device.width) : null;
        /*
         * Jira GRW-729 — the payment QR, where this counter prints one (on by default): a UPI link for exactly what is
         * due, else the picture the branch shows at the till; "PAID" in its place once the bill is paid (BR-01). A QR
         * that will not draw is left off — it never stops the bill.
         */
        let payQr: BillData['payQr'] = null;
        let paidStamp: string | null = null;
        if (device.billQr && doc.paid && doc.qrReady) paidStamp = t('paidStamp');
        else if (device.billQr && doc.payQr) {
          const dots = device.width === '58' ? 384 : 576;
          let bitmap = null;
          try {
            bitmap = doc.payQr.kind === 'upi' ? qrBitmap(encodeQr(doc.payQr.uri), dots) : await qrPictureBitmap(doc.payQr.image, device.width);
          } catch {
            bitmap = null;
          }
          if (bitmap) payQr = { bitmap, caption: t('scanToPay', { amount: formatMoney(doc.payQr.amountMinor, 'INR', locale) }) };
        }
        return [{ ticket: billTicket({ ...data, logo, payQr, paidStamp }, copy), copies: reprint ? 1 : device.billCopies }];
    },
    [locale, timezone, t, tDoc, tPay, typeWords, billCopy],
  );
  const printBill = useCallback(
    (saleId: string, reprint = false, held?: { couponCode?: string; discountMinor?: number }) => run(() => billJobs(saleId, reprint, held)),
    [run, billJobs],
  );

  /**
   * Jira GRW-716 — a receipt the till built itself, printed with no internet: no bill number yet (the server gives the
   * next one when the order is sent; the owner's decision, 2026-11-16 — one numbering run), and a line that says so.
   */
  const printReceipt = useCallback(
    (data: BillData) => run(async () => [{ ticket: billTicket(data, billCopy()), copies: readPrinterSettings().billCopies }]),
    [run, billCopy],
  );
  /**
   * Owner, 2026-11-23 — "one option to print … both print bill and kitchen slip should be printed along with it". The bill
   * and the kitchen's slip(s) in one go, one line saying how it went. `kot` when the slips are in hand (an order paid on the
   * spot: the kitchen has not had them); otherwise they are read from the server and marked REPRINT — an order paid at
   * Pickup was sent to the kitchen when it was taken, and an unmarked second slip could be cooked twice.
   */
  const printBillAndKots = useCallback(
    (input: { saleId: string; order: OrderRef; kot?: KitchenTicketDto | readonly KitchenTicketDto[]; receipt?: BillData }) =>
      run(async () => {
        const bill = input.receipt ? [{ ticket: billTicket(input.receipt, billCopy()), copies: readPrinterSettings().billCopies }] : await billJobs(input.saleId);
        let kots: PrintJob[];
        if (input.kot) kots = await kotJobs(Array.isArray(input.kot) ? input.kot : [input.kot as KitchenTicketDto], input.order, false);
        else {
          const read = await api.saleKots(input.saleId);
          kots = await kotJobs(read.tickets, read, true);
        }
        return [...bill, ...kots];
      }),
    [run, billJobs, kotJobs, billCopy],
  );
  const autoReceipt = useCallback(
    (data: BillData) => {
      if (readPrinterSettings().autoBill) void printReceipt(data);
    },
    [printReceipt],
  );

  /** What the till calls after an order goes in: the KOT prints by itself only where this device is set to. */
  const autoKot = useCallback(
    (kot: KitchenTicketDto | readonly KitchenTicketDto[] | undefined, order: OrderRef) => {
      const kots = kot === undefined ? [] : Array.isArray(kot) ? kot : [kot as KitchenTicketDto];
      if (kots.length > 0 && readPrinterSettings().autoKot) void printKot(kots, order);
    },
    [printKot],
  );

  /** And after a bill is paid. */
  const autoBill = useCallback(
    (saleId: string) => {
      if (readPrinterSettings().autoBill) void printBill(saleId);
    },
    [printBill],
  );

  const testPrint = useCallback(
    () =>
      run(async () => [
        {
          ticket: {
            lines: [
              { kind: 'text', text: session?.businessName ?? t('settings'), align: 'center', bold: true, size: 2 },
              { kind: 'rule' },
              { kind: 'text', text: t('testLine'), align: 'center' },
              { kind: 'text', text: kotWhen(new Date().toISOString()), align: 'center' },
            ],
            cut: true,
          },
          copies: 1,
        },
      ]),
    [run, session?.businessName, t, kotWhen],
  );

  const clearStatus = useCallback(() => setStatus({ state: 'idle' }), []);
  // One object for as long as nothing in it changes, so a screen can put the printer in a callback's dependencies
  // without rebuilding that callback on every render.
  return useMemo(
    () => ({ settings, setSettings, status, clearStatus, printKot, printOrderKots, reprintKots, printBill, printBillAndKots, printReceipt, autoKot, autoBill, autoReceipt, testPrint }),
    [settings, setSettings, status, clearStatus, printKot, printOrderKots, reprintKots, printBill, printBillAndKots, printReceipt, autoKot, autoBill, autoReceipt, testPrint],
  );
}

export type TicketPrinter = ReturnType<typeof useTicketPrinter>;

/** What the last print did, in one line; Try again when it did not come out. Nothing at all when idle. */
export function PrintStatusLine({ printer }: { printer: TicketPrinter }) {
  const t = useTranslations('print');
  const s = printer.status;
  if (s.state === 'idle') return null;
  if (s.state === 'nothing') {
    return (
      <p className="tp-status" role="status">
        {s.message}
      </p>
    );
  }
  if (s.state === 'printing' || s.state === 'done') {
    return (
      <p className="tp-status" role="status">
        {s.state === 'printing' ? t('printing') : t('printed')}
      </p>
    );
  }
  return (
    <p className="tp-status is-failed" role="alert">
      <span>{s.message}</span>
      <button type="button" className="btn btn-ghost tp-retry" onClick={s.retry}>
        {s.again ? t('printAgain') : t('retry')}
      </button>
    </p>
  );
}

/**
 * The paid screen's print row (owner, 2026-11-16): Print bill, Print KOT, and this device's printer — one row, under
 * the amount, the first thing after it. The KOT is offered here, after payment, and on the order screen; not while the
 * order waits in the Queue. `kot` when this screen has the ticket in hand (an order paid on the spot); `kitchen` to read
 * the order's tickets from the server (an order paid at the Queue).
 */
export function TillPrintActions({
  printer,
  saleId,
  kot,
  kitchen = false,
  order,
  bill = false,
  receipt,
}: {
  printer: TicketPrinter;
  saleId: string;
  /** Jira GRW-733 — the order's slips, one per station (or the one slip of a branch without stations). */
  kot?: KitchenTicketDto | readonly KitchenTicketDto[];
  kitchen?: boolean;
  order: OrderRef;
  bill?: boolean;
  /** Jira GRW-716 — taken offline: the receipt the till built itself, printed in place of the server's bill. */
  receipt?: BillData;
}) {
  const t = useTranslations('print');
  const [printerOpen, setPrinterOpen] = useState(false);
  const busy = printer.status.state === 'printing';
  const hasKot = (Array.isArray(kot) ? kot.length > 0 : Boolean(kot)) || kitchen;
  if (!hasKot && !bill) return null;
  const printBillOnly = () => void (receipt ? printer.printReceipt(receipt) : printer.printBill(saleId));
  const printKotOnly = () => void (kot ? printer.printKot(kot, order) : printer.printOrderKots(saleId, true));
  /*
   * Owner, 2026-11-23 — one Print for both: the bill and the kitchen's slip together, the button the counter needs every
   * time; the bill alone, the slip alone and the printer are in its ⋮. A slip the kitchen already had (an order paid at
   * Pickup) prints marked REPRINT (`printBillAndKots`).
   */
  if (bill && hasKot) {
    return (
      <div className="tp-actions">
        <div className="tp-actions-row tp-actions-one">
          <button type="button" className="btn btn-ghost tp-print-both" disabled={busy} onClick={() => void printer.printBillAndKots({ saleId, order, kot, receipt })}>
            <IconPrint />
            {t('printBoth')}
          </button>
          <MenuKebab
            className="tp-print-more"
            label={t('morePrint')}
            items={[
              { label: t('billOnly'), onSelect: printBillOnly },
              { label: t('kotOnly'), onSelect: printKotOnly },
              { label: t('settings'), onSelect: () => setPrinterOpen(true) },
            ]}
          />
        </div>
        {printerOpen ? <PrinterSheet printer={printer} onClose={() => setPrinterOpen(false)} /> : null}
        <PrintStatusLine printer={printer} />
      </div>
    );
  }
  return (
    <div className="tp-actions">
      <div className="tp-actions-row">
        {bill ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void (receipt ? printer.printReceipt(receipt) : printer.printBill(saleId))}>
            <IconPrint />
            {t('printBill')}
          </button>
        ) : null}
        {hasKot ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void (kot ? printer.printKot(kot, order) : printer.printOrderKots(saleId, false))}
          >
            <IconPrint />
            {t('printKot')}
          </button>
        ) : null}
        {/* This device's printer, beside the prints it decides. */}
        <PrinterButton printer={printer} />
      </div>
      <PrintStatusLine printer={printer} />
    </div>
  );
}

/** The till's Printer button: opens this device's printer settings. */
export function PrinterButton({ printer }: { printer: TicketPrinter }) {
  const t = useTranslations('print');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost tp-open" aria-label={t('settings')} onClick={() => setOpen(true)}>
        <IconPrint />
        <span className="tp-open-label">{t('settings')}</span>
      </button>
      {open ? <PrinterSheet printer={printer} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function PrinterSheet({ printer, onClose }: { printer: TicketPrinter; onClose: () => void }) {
  const t = useTranslations('print');
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose });
  const { settings, setSettings } = printer;
  const [pairing, setPairing] = useState(false);
  const [pairFailed, setPairFailed] = useState(false);
  const canBluetooth = bluetoothSupported();

  const pair = async () => {
    setPairing(true);
    setPairFailed(false);
    try {
      const picked = await pairPrinter();
      setSettings({ ...settings, bluetooth: { id: picked.id, name: picked.name || t('unnamedPrinter') } });
    } catch {
      setPairFailed(true);
    } finally {
      setPairing(false);
    }
  };

  return (
    <>
      <div className="acct-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="acct-menu tp-sheet" role="dialog" aria-modal="true" aria-label={t('settingsTitle')} tabIndex={-1}>
        <div className="acct-head">
          <div className="acct-role">{t('settingsTitle')}</div>
          <div className="acct-sub">{t('settingsSub')}</div>
        </div>

        <fieldset className="tp-field">
          <legend>{t('paper')}</legend>
          <div className="tp-seg" role="radiogroup">
            {(['58', '80'] as const).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={settings.width === w} className={settings.width === w ? 'is-on' : ''} onClick={() => setSettings({ ...settings, width: w })}>
                {w === '58' ? t('paper58') : t('paper80')}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="tp-field">
          <legend>{t('connection')}</legend>
          {settings.bluetooth ? (
            <div className="tp-paired">
              <span>{t('pairedTo', { name: settings.bluetooth.name })}</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  forgetPrinter(settings.bluetooth?.id);
                  setSettings({ ...settings, bluetooth: null });
                }}
              >
                {t('remove')}
              </button>
            </div>
          ) : (
            <p className="tp-hint">{t('viaDialog')}</p>
          )}
          {canBluetooth ? (
            !settings.bluetooth ? (
              <button type="button" className="btn" disabled={pairing} onClick={() => void pair()}>
                {pairing ? t('pairing') : t('pair')}
              </button>
            ) : null
          ) : (
            <p className="tp-hint">{t('noBluetooth')}</p>
          )}
          {pairFailed ? (
            <p className="field-error" role="alert">
              {t('pairFailed')}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="tp-field">
          <label className="tp-check">
            <input type="checkbox" checked={settings.autoKot} onChange={(e) => setSettings({ ...settings, autoKot: e.target.checked })} />
            <span>{t('autoKot')}</span>
          </label>
          <label className="tp-check">
            <input type="checkbox" checked={settings.autoBill} onChange={(e) => setSettings({ ...settings, autoBill: e.target.checked })} />
            <span>{t('autoBill')}</span>
          </label>
          <label className="tp-check">
            <input type="checkbox" checked={settings.billQr} onChange={(e) => setSettings({ ...settings, billQr: e.target.checked })} />
            <span>{t('billQr')}</span>
          </label>
          <label className="tp-check">
            <span>{t('copies')}</span>
            <select value={settings.billCopies} onChange={(e) => setSettings({ ...settings, billCopies: e.target.value === '2' ? 2 : 1 })}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
        </fieldset>

        <StationPrinters printer={printer} />

        <PrintStatusLine printer={printer} />
        <div className="acct-form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void printer.testPrint()}>
            {t('test')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('done')}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Jira GRW-733 — where each kitchen station's slips come out, set on THIS device (the one that prints for it): this
 * printer, the station's own Bluetooth printer (the Bar's beside the bar), or not from here. Shown only where the branch
 * has named stations; a branch without them prints one slip here, as it always did. A business with no kitchen gets a
 * refusal from the API and sees nothing.
 */
function StationPrinters({ printer }: { printer: TicketPrinter }) {
  const t = useTranslations('print');
  const branch = useBranch();
  const session = useSession();
  const location = branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;
  const [stations, setStations] = useState<Array<{ key: string; name: string }> | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [pairFailed, setPairFailed] = useState(false);
  const { settings, setSettings } = printer;

  useEffect(() => {
    if (!location) return;
    let live = true;
    api
      .kitchenStations(location)
      .then((s) => {
        if (live) setStations(s.stations.length === 0 ? [] : [{ key: stationKey(null), name: t('defaultStation') }, ...s.stations.map((x) => ({ key: x.id, name: x.name }))]);
      })
      .catch(() => live && setStations([]));
    return () => {
      live = false;
    };
  }, [location, t]);

  if (!stations || stations.length === 0) return null;
  const routeOf = (key: string): StationRoute => settings.stations[key] ?? { to: 'here' };
  const setRoute = (key: string, route: StationRoute) => setSettings({ ...settings, stations: { ...settings.stations, [key]: route } });
  const pairFor = async (key: string) => {
    setPairing(key);
    setPairFailed(false);
    try {
      const picked = await pairPrinter();
      setRoute(key, { to: 'own', bluetooth: { id: picked.id, name: picked.name || t('unnamedPrinter') } });
    } catch {
      setPairFailed(true);
    } finally {
      setPairing(null);
    }
  };

  return (
    <fieldset className="tp-field tp-stations">
      <legend>{t('stationsTitle')}</legend>
      <p className="tp-hint">{t('stationsHint')}</p>
      {stations.map((st) => {
        const route = routeOf(st.key);
        return (
          <div key={st.key} className="tp-station">
            <label className="tp-check">
              <span>{st.name}</span>
              <select
                aria-label={t('stationWhere', { station: st.name })}
                value={route.to}
                onChange={(e) => {
                  const to = e.target.value;
                  if (to === 'own') void pairFor(st.key);
                  else setRoute(st.key, to === 'off' ? { to: 'off' } : { to: 'here' });
                }}
              >
                <option value="here">{t('stationHere')}</option>
                {bluetoothSupported() || route.to === 'own' ? <option value="own">{t('stationOwn')}</option> : null}
                <option value="off">{t('stationOff')}</option>
              </select>
            </label>
            {route.to === 'own' ? <p className="tp-hint">{t('pairedTo', { name: route.bluetooth.name })}</p> : null}
            {pairing === st.key ? <p className="tp-hint">{t('pairing')}</p> : null}
          </div>
        );
      })}
      {pairFailed ? (
        <p className="field-error" role="alert">
          {t('pairFailed')}
        </p>
      ) : null}
    </fieldset>
  );
}
