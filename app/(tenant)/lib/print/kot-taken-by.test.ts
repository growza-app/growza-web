import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { encodeTicket, type Rasterize } from './escpos';
import { kotFromApi } from './from-api';
import { kotTicket, type KotCopy, type KotData } from './ticket';
import { sentByOf } from '../../kitchen/KitchenClient';

/** Jira GRW-730 — who took the order: "By Ravi" under the slip number, and the name beside the minutes on the Kitchen card. */
const copy: KotCopy = {
  title: 'KITCHEN SLIP',
  added: 'ADDED TO ORDER',
  cancelled: 'CANCELLED',
  packed: 'PACK IT',
  reprint: 'REPRINT',
  kotNo: (n) => `Slip ${n}`,
  token: (n) => `Token #${n}`,
  items: (n) => `${n} items`,
  by: (name) => `By ${name}`,
};
const words = (type: 'dine_in' | 'takeaway' | 'delivery', table: string | null) => {
  const w = type === 'dine_in' ? 'DINE-IN' : type === 'takeaway' ? 'TAKEAWAY' : 'DELIVERY';
  return table ? `${w} · ${table}` : w;
};
const dto = (takenBy: string | null | undefined, kind: 'new' | 'add' = 'new') => ({
  id: 'k',
  number: 7,
  kind,
  createdAt: '2026-11-18T10:00:00Z',
  items: [{ name: 'Veg Thali', qty: 2 }, { name: 'Sweet Lassi', qty: 1 }],
  ...(takenBy === undefined ? {} : { takenBy }),
});
const texts = (kot: KotData) => kotTicket(kot, copy).lines.map((l) => (l.kind === 'text' ? l.text : l.kind === 'pair' ? `${l.left}|${l.right}` : l.kind));
const t5 = { tokenNo: null, channel: 'counter', orderType: 'dine_in' as const, tableName: 'T5 · AC Hall' };
const screen = readFileSync(join(__dirname, '../../kitchen/KitchenClient.tsx'), 'utf8');
const css = readFileSync(join(__dirname, '../../styles/99-dining-tables.css'), 'utf8');
const payFlow = readFileSync(join(__dirname, '../../appointments/new/PayFlow.tsx'), 'utf8');
const printer = readFileSync(join(__dirname, '../../components/TicketPrinter.tsx'), 'utf8');

describe('AC-01 — a waiter’s order: the slip says "By Ravi" under its number', () => {
  it('the line comes straight after "Slip 7", and the table line no longer carries the name', () => {
    const lines = texts(kotFromApi(dto('Ravi'), t5, () => '18 Nov, 3:30 pm', false, words));
    const at = lines.indexOf('Slip 7|18 Nov, 3:30 pm');
    expect(at).toBeGreaterThan(-1);
    expect(lines[at + 1]).toBe('By Ravi');
    expect(lines).toContain('DINE-IN · T5 · AC Hall');
    expect(lines.filter((l) => l.includes('Ravi'))).toEqual(['By Ravi']);
  });

  it('a round added by a second person names that person on its own slip', () => {
    expect(texts(kotFromApi(dto('Amit', 'add'), t5, () => 'now', false, words))).toContain('By Amit');
  });

  it('the till prints it in the screen’s language', () => {
    expect(printer).toContain("by: (name: string) => t('kotBy', { name })");
    expect(en.print.kotBy).toBe('By {name}');
    expect(hi.print.kotBy).toContain('{name}');
    expect(hi.print.kotBy).not.toBe(en.print.kotBy);
  });
});

describe('AC-02 — renamed later: a reprint prints what the slip kept', () => {
  it('the slip prints the name the API kept on it, as given — no lookup here', () => {
    const reprint = texts(kotFromApi(dto('Ravi'), t5, () => 'now', true, words));
    expect(reprint[0]).toBe('** REPRINT **');
    expect(reprint).toContain('By Ravi');
  });
});

describe('AC-03 — a delivery app’s order names the app', () => {
  it('"By Swiggy", never the cashier', () => {
    const lines = texts(kotFromApi(dto('Swiggy'), { tokenNo: 4, channel: 'swiggy', orderType: 'delivery' }, () => 'now', false, words));
    expect(lines).toContain('Swiggy');
    expect(lines).toContain('By Swiggy');
  });
});

describe('Boundary — nobody to name', () => {
  it('no name, a null name, or only spaces: no line at all', () => {
    const plain = texts(kotFromApi(dto(undefined), t5, () => 'now', false, words));
    expect(texts(kotFromApi(dto(null), t5, () => 'now', false, words))).toEqual(plain);
    expect(texts(kotFromApi(dto('   '), t5, () => 'now', false, words))).toEqual(plain);
    expect(plain.some((l) => l.startsWith('By '))).toBe(false);
  });

  it('the item table is byte-identical with or without the name — only the one line is added', () => {
    const r: Rasterize = (_line, w) => ({ width: w, height: 1, bits: new Uint8Array(w / 8) });
    const without = kotTicket(kotFromApi(dto(null), t5, () => 'now', false, words), copy);
    const withName = kotTicket(kotFromApi(dto('Ravi'), t5, () => 'now', false, words), copy);
    const extra = withName.lines.filter((l) => !(l.kind === 'text' && l.text === 'By Ravi'));
    expect(extra).toEqual(without.lines);
    const ruleAt = (t: typeof without) => t.lines.findIndex((l) => l.kind === 'rule');
    expect(withName.lines.slice(ruleAt(withName))).toEqual(without.lines.slice(ruleAt(without)));
    expect(encodeTicket(withName, '58', r).length).toBeGreaterThan(encodeTicket(without, '58', r).length);
  });

  it('a 40-letter name wraps on the roll, never runs off it', () => {
    const long = 'Venkatanarasimharajuvaripeta Subramanyam';
    const lines = kotTicket(kotFromApi(dto(long), t5, () => 'now', false, words), copy).lines;
    expect(lines).toContainEqual({ kind: 'text', text: `By ${long}` });
  });

  it('a copy with no "By" word prints the name on its own', () => {
    const { by: _by, ...bare } = copy;
    expect(kotTicket(kotFromApi(dto('Ravi'), t5, () => 'now', false, words), bare).lines).toContainEqual({ kind: 'text', text: 'Ravi' });
  });

  it('a slip printed offline names whoever is at the till', () => {
    expect(payFlow).toContain("takenBy: session?.name?.trim() || null");
  });
});

describe('the Kitchen card: "Ravi · 5 min"', () => {
  it('each sender once, first sender first; nobody named is no name', () => {
    expect(sentByOf(['Ravi'])).toBe('Ravi');
    expect(sentByOf(['Ravi', 'Amit'])).toBe('Ravi, Amit');
    expect(sentByOf([])).toBeNull();
    expect(sentByOf(undefined)).toBeNull();
    expect(sentByOf(['  '])).toBeNull();
  });

  it('the name sits between the table and the minutes, with a full-name hint in both languages', () => {
    const head = screen.slice(screen.indexOf('kd-card-label'), screen.indexOf('kd-card-age">'));
    expect(head).toContain('className="kd-card-by"');
    expect(head).toContain("title={t('sentBy', { name: sentBy })}");
    expect(en.kitchen.sentBy).toBe('Sent by {name}');
    expect(hi.kitchen.sentBy).toContain('{name}');
  });

  it('QA — 344px with a long name: the name is cut (…), the minutes never are', () => {
    const rule = css.slice(css.indexOf('.kd-card-by {'), css.indexOf('}', css.indexOf('.kd-card-by {')));
    for (const bit of ['min-width: 2rem', 'overflow: hidden', 'text-overflow: ellipsis', 'white-space: nowrap']) expect(rule).toContain(bit);
    expect(css).toMatch(/\.kd-card-age \{ flex: none; white-space: nowrap; \}/);
    // Type in rem, never px.
    expect(rule).not.toMatch(/font-size: \d+px/);
  });
});
