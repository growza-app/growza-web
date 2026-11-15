'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError } from '../lib/api';
import type { KitchenTicketDto } from '../lib/api-types';
import { intlLocale, formatMoney } from '../lib/format';
import { billFromDocument, kotFromApi } from '../lib/print/from-api';
import { bluetoothSupported, forgetPrinter } from '../lib/print/bluetooth';
import {
  DEFAULT_PRINTER,
  pairPrinter,
  printTicket,
  PrinterError,
  readPrinterSettings,
  savePrinterSettings,
  type PrinterSettings,
} from '../lib/print/printer';
import { billTicket, kotTicket, type Ticket } from '../lib/print/ticket';
import { useSession } from './SessionProvider';
import { IconPrint } from './icons';

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
  | { state: 'failed'; message: string; retry: () => void };

export interface OrderRef {
  tokenNo: number | null;
  channel: string | null;
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
      reprint: t('reprint'),
      kotNo: (n: number) => t('kotNo', { n }),
      token: (n: number) => t('token', { n }),
      items: (n: number) => t('items', { n }),
    }),
    [t],
  );

  /** Print, saying what happened. `job` builds the ticket(s); a failure keeps `job` for Try again. */
  const run = useCallback(
    async (job: () => Promise<{ ticket: Ticket; copies: number }[]>) => {
      const attempt = async (): Promise<void> => {
        setStatus({ state: 'printing' });
        try {
          const current = readPrinterSettings();
          for (const { ticket, copies } of await job()) await printTicket(ticket, current, copies);
          setStatus({ state: 'done' });
        } catch (e) {
          const message =
            e instanceof PrinterError && e.code === 'not_paired'
              ? t('notPaired')
              : e instanceof ApiError && e.status < 500
                ? t('billBlocked', { reason: e.message })
                : t('failed');
          setStatus({ state: 'failed', message, retry: () => void attempt() });
        }
      };
      await attempt();
    },
    [t],
  );

  /** One KOT, as the order's change just returned it. */
  const printKot = useCallback(
    (kot: KitchenTicketDto, order: OrderRef, reprint = false) =>
      run(async () => [{ ticket: kotTicket(kotFromApi(kot, order, kotWhen, reprint), kotCopy()), copies: 1 }]),
    [run, kotWhen, kotCopy],
  );

  /** Every KOT the order has had, printed again and marked REPRINT. */
  const reprintKots = useCallback(
    (saleId: string) =>
      run(async () => {
        const read = await api.saleKots(saleId);
        return read.tickets.map((k) => ({ ticket: kotTicket(kotFromApi(k, read, kotWhen, true), kotCopy()), copies: 1 }));
      }),
    [run, kotWhen, kotCopy],
  );

  /**
   * The bill: the order's GST document, issued if it has not been (idempotent — the same number every time), laid
   * out for the roll. One numbering for every bill the business gives out, whether printed, sent or downloaded.
   */
  const printBill = useCallback(
    (saleId: string, reprint = false) =>
      run(async () => {
        const issued = await api.issueDocument(saleId);
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
            paidBy: (modes) =>
              modes.length === 0
                ? null
                : t('paidBy', { ways: modes.map((m) => (m === 'cash' || m === 'card' || m === 'upi' || m === 'other' ? tPay(m) : m)).join(' + ') }),
            discount: t('discount'),
            points: (n) => t('points', { n }),
            tax: (name, rate, included) =>
              rate === null ? name : t(included ? 'taxAtIncluded' : 'taxAt', { tax: name, rate: String(rate) }),
          },
          { figure, money: (minor) => formatMoney(minor, 'INR', locale), when },
          reprint,
        );
        const copy = {
          reprint: t('reprint'),
          phone: (v: string) => t('phone', { v }),
          gstin: (v: string) => t('gstin', { v }),
          fssai: (v: string) => t('fssai', { v }),
          name: (v: string) => t('name', { v }),
          date: (v: string) => t('date', { v }),
          cashier: (v: string) => t('cashier', { v }),
          billNo: (v: string) => t('billNo', { v }),
          token: (n: number) => t('token', { n }),
          colItem: t('colItem'),
          colQty: t('colQty'),
          colPrice: t('colPrice'),
          colAmount: t('colAmount'),
          totalQty: (n: number) => t('totalQty', { n }),
          subTotal: t('subTotal'),
          roundOff: t('roundOff'),
          grandTotal: t('grandTotal'),
          thanks: t('thanks'),
        };
        return [{ ticket: billTicket(data, copy), copies: reprint ? 1 : readPrinterSettings().billCopies }];
      }),
    [run, locale, timezone, t, tDoc, tPay],
  );

  /** What the till calls after an order goes in: the KOT prints by itself only where this device is set to. */
  const autoKot = useCallback(
    (kot: KitchenTicketDto | undefined, order: OrderRef) => {
      if (kot && readPrinterSettings().autoKot) void printKot(kot, order);
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

  return { settings, setSettings, status, clearStatus: () => setStatus({ state: 'idle' }), printKot, reprintKots, printBill, autoKot, autoBill, testPrint };
}

export type TicketPrinter = ReturnType<typeof useTicketPrinter>;

/** What the last print did, in one line; Try again when it did not come out. Nothing at all when idle. */
export function PrintStatusLine({ printer }: { printer: TicketPrinter }) {
  const t = useTranslations('print');
  const s = printer.status;
  if (s.state === 'idle') return null;
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
        {t('retry')}
      </button>
    </p>
  );
}

/**
 * Print KOT and Print bill, where an order was just taken or paid. Each prints on its own tap even when this device
 * prints by itself, because a KOT that jammed or a guest who wants a second bill is an ordinary minute at a counter.
 */
export function TillPrintActions({
  printer,
  saleId,
  kot,
  order,
  bill = false,
}: {
  printer: TicketPrinter;
  saleId: string;
  kot?: KitchenTicketDto;
  order: OrderRef;
  bill?: boolean;
}) {
  const t = useTranslations('print');
  const busy = printer.status.state === 'printing';
  if (!kot && !bill) return null;
  return (
    <div className="tp-actions">
      <div className="tp-actions-row">
        {kot ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void printer.printKot(kot, order)}>
            <IconPrint />
            {t('printKot')}
          </button>
        ) : null}
        {bill ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void printer.printBill(saleId)}>
            <IconPrint />
            {t('printBill')}
          </button>
        ) : null}
        {/* This device's printer, beside the prints it decides — the only place a phone has room for it. */}
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

function PrinterSheet({ printer, onClose }: { printer: TicketPrinter; onClose: () => void }) {
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
                  forgetPrinter();
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
            <span>{t('copies')}</span>
            <select value={settings.billCopies} onChange={(e) => setSettings({ ...settings, billCopies: e.target.value === '2' ? 2 : 1 })}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
        </fieldset>

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
