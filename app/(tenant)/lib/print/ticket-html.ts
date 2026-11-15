import type { PaperWidth, Ticket, TicketLine } from './ticket';

/**
 * Jira GRW-713 — a ticket as the HTML the print dialog prints, for every device: Android, an iPhone through
 * AirPrint, a laptop with any printer.
 *
 * The sheet is sized to the roll (`@page` 58mm or 80mm wide, auto height) so a thermal printer driver prints one
 * strip, not an A4 page with a receipt in its corner. Text is escaped here: a dish name is typed by the business
 * and must never become markup.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function lineHtml(line: TicketLine): string {
  switch (line.kind) {
    case 'gap':
      return '<div class="tp-gap"></div>';
    case 'rule':
      return '<div class="tp-rule"></div>';
    case 'pair':
      return `<div class="tp-pair${line.bold ? ' is-bold' : ''}"><span>${escapeHtml(line.left)}</span><span>${escapeHtml(line.right)}</span></div>`;
    case 'item':
      return `<div class="tp-item${line.header ? ' is-bold' : ''}"><span>${escapeHtml(line.name)}</span><span>${escapeHtml(line.qty)}</span><span class="tp-price">${escapeHtml(line.price)}</span><span>${escapeHtml(line.amount)}</span></div>`;
    case 'text': {
      const cls = ['tp-text', `is-${line.align ?? 'left'}`, line.bold ? 'is-bold' : '', line.size === 2 ? 'is-big' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}">${escapeHtml(line.text)}</div>`;
    }
  }
}

export function ticketHtml(ticket: Ticket): string {
  return ticket.lines.map(lineHtml).join('');
}

/** The page rule for this roll. Set only while printing, so it never changes how anything else prints. */
export function pageRule(width: PaperWidth): string {
  return `@page { size: ${width}mm auto; margin: 0; }`;
}
