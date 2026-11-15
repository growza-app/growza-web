import { encodeTicket } from './escpos';
import { pairPrinter, PrinterError, writeToPrinter } from './bluetooth';
import { canvasRasterizer } from './rasterize';
import { pageRule, ticketHtml } from './ticket-html';
import type { PaperWidth, Ticket } from './ticket';

/**
 * Jira GRW-713 — this device's printer, and the one call the till makes to print.
 *
 * ## Why the settings live on the device
 *
 * A printer belongs to a counter, not to a business: the phone at the front has the Bluetooth printer beside it and
 * the laptop in the office prints to whatever it prints to. So what printer, what roll, and whether to print without
 * asking are kept in this browser (`localStorage`), and a second counter sets up its own. Nothing is lost if they
 * vanish — the till falls back to the print dialog, which always works.
 */

export interface PrinterSettings {
  width: PaperWidth;
  /** The Bluetooth printer this device paired with; null prints through the dialog. */
  bluetooth: { id: string; name: string } | null;
  /** Print a KOT the moment an order goes to the kitchen. */
  autoKot: boolean;
  /** Print the bill the moment it is paid. */
  autoBill: boolean;
  /** Copies of each bill (a KOT is always one). */
  billCopies: 1 | 2;
}

export const DEFAULT_PRINTER: PrinterSettings = { width: '58', bluetooth: null, autoKot: false, autoBill: false, billCopies: 1 };

const KEY = 'growza.printer.v1';

export function readPrinterSettings(): PrinterSettings {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULT_PRINTER;
    const p = JSON.parse(raw) as Partial<PrinterSettings>;
    return {
      width: p.width === '80' ? '80' : '58',
      bluetooth: p.bluetooth && typeof p.bluetooth.id === 'string' ? { id: p.bluetooth.id, name: String(p.bluetooth.name ?? '') } : null,
      autoKot: p.autoKot === true,
      autoBill: p.autoBill === true,
      billCopies: p.billCopies === 2 ? 2 : 1,
    };
  } catch {
    return DEFAULT_PRINTER;
  }
}

export function savePrinterSettings(s: PrinterSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // A private window: the settings last for this visit only, and the dialog still prints.
  }
}

export { pairPrinter, PrinterError };

function pageFont(): string {
  try {
    return getComputedStyle(document.body).fontFamily || 'sans-serif';
  } catch {
    return 'sans-serif';
  }
}

/**
 * Print through the browser's own dialog: the ticket is put on the page as the only thing the print stylesheet
 * shows, sized to the roll, and taken away again when the dialog closes.
 */
export function printWithDialog(ticket: Ticket, width: PaperWidth): Promise<void> {
  const root = document.createElement('div');
  root.className = `tp-root is-${width}`;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = ticketHtml(ticket);
  const style = document.createElement('style');
  style.textContent = pageRule(width);
  document.body.appendChild(root);
  document.head.appendChild(style);
  document.documentElement.classList.add('tp-printing');
  return new Promise((resolve) => {
    let gone = false;
    const cleanUp = () => {
      if (gone) return;
      gone = true;
      root.remove();
      style.remove();
      document.documentElement.classList.remove('tp-printing');
      resolve();
    };
    window.addEventListener('afterprint', cleanUp, { once: true });
    /*
     * Review finding 5 — a phone's browser can hand back from print() before it prints and never say `afterprint`.
     * The next print waits on this one, so waiting a full minute held a bill behind its KOT for a minute. The dialog
     * closing gives the page its focus back; failing even that, fifteen seconds is long enough for a print preview
     * to have taken its copy of the page.
     */
    const onFocus = () => setTimeout(cleanUp, 500);
    window.addEventListener('focus', onFocus, { once: true });
    setTimeout(cleanUp, 15_000);
    window.print();
  });
}

/**
 * One print at a time. A kitchen's order paid on the spot prints its KOT and then its bill; through the dialog the
 * second must wait for the first sheet to be taken away, or both land on one page — and over Bluetooth two writes
 * interleaved are garbage on the paper.
 */
let line: Promise<unknown> = Promise.resolve();
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const next = line.then(job, job);
  line = next.catch(() => undefined);
  return next;
}

export type PrintOutcome = 'printed' | 'dialog';

/**
 * Print one ticket the way this device is set up to. A Bluetooth printer that has gone away throws a `PrinterError`
 * — the caller says "did not print" with a Retry, and never stops the sale for it (story BR-03).
 */
export function printTicket(ticket: Ticket, settings: PrinterSettings, copies = 1): Promise<PrintOutcome> {
  return inTurn(() => printNow(ticket, settings, copies));
}

async function printNow(ticket: Ticket, settings: PrinterSettings, copies: number): Promise<PrintOutcome> {
  if (!settings.bluetooth) {
    await printWithDialog(ticket, settings.width);
    return 'dialog';
  }
  const family = pageFont();
  // A canvas draws with a web font only once it has loaded; a page that has shown no Hindi yet may not have it.
  try {
    await document.fonts?.load(`400 24px ${family}`, 'कखग');
  } catch {
    // The fallback font still draws Devanagari on every phone that can show it.
  }
  const data = encodeTicket(ticket, settings.width, canvasRasterizer(family));
  for (let i = 0; i < copies; i += 1) await writeToPrinter(data, settings.bluetooth.id);
  return 'printed';
}
