import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { barTabShown } from './pos-type-bar';

const client = readFileSync(resolve(__dirname, 'PosClient.tsx'), 'utf8');
const flow = readFileSync(resolve(__dirname, '../appointments/new/PayFlow.tsx'), 'utf8');
const pos = readFileSync(resolve(__dirname, '../styles/99-pos.css'), 'utf8');
const tables = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8'));
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8'));

/**
 * Owner, 2026-11-22 ("go D", "keep the name as pickup", "keep Kitchen as its own icon") — a branch that seats its guests
 * has ONE row on top of the POS: Dine-in · Takeaway · Delivery, the Kitchen, and a ⋮ for Return. Pickup is under Takeaway.
 */
describe('the one-row POS bar', () => {
  it('marks Takeaway in Pickup, none in Return, and the till’s own type otherwise', () => {
    expect(barTabShown('queue', 'dine_in')).toBe('takeaway');
    expect(barTabShown('return', 'delivery')).toBeNull();
    expect(barTabShown('sell', 'delivery')).toBe('delivery');
  });

  it('is only for a branch that seats its guests, never a waiter’s bar or full screen', () => {
    expect(client).toContain('const tablesBar = typesHere && !waiter && !fullScreen;');
    // The waiter's bar is checked first, then this one, then full screen's own header.
    const w = client.indexOf('{waiter ? (');
    const b = client.indexOf(') : tablesBar ? (');
    const f = client.indexOf(') : fullScreen ? (');
    expect(w).toBeGreaterThan(-1);
    expect(w).toBeLessThan(b);
    expect(b).toBeLessThan(f);
  });

  it('holds the switch, the Kitchen as its own icon and a ⋮ with Return — no Sell / Pickup / Return tabs', () => {
    const bar = client.slice(client.indexOf(') : tablesBar ? ('), client.indexOf(') : fullScreen ? ('));
    // Not offered while items are added to an order (owner, 2026-11-23): its type is settled.
    expect(bar).toContain('<div className="pos-bar-typeslot" ref={setTypeSlot} hidden={addingToToken !== null} />');
    expect(bar).toContain('className="btn btn-ghost pos-bar-kitchen"');
    expect(bar).toContain("...(canReturn ? [{ label: t('returnBill'), onSelect: () => void openReturn() }] : []),");
    // Owner, 2026-11-23 — the ⋮ also holds Printer on a phone and "Sound when paid".
    expect(bar).toContain("...(narrow ? [{ label: t('printerMenu'), onSelect: () => setPrinterOpen(true) }] : []),");
    expect(bar).toContain("label: soundOn ? t('soundWhenPaidOn') : t('soundWhenPaidOff'),");
    expect(bar).not.toContain('pos-tabs');
    expect(bar).not.toContain('pos-bar-back');
  });

  it('the till draws its switch into that bar, and any tab there leads back from Pickup or Return', () => {
    expect(flow).toContain('const typeInBar = Boolean(typeBar?.slot) && typesHere && !token && !waiter && !addingTo;');
    expect(flow).toContain('{createPortal(');
    expect(flow).toContain("if (typeInBar && typeBar && typeBar.mode !== 'sell') {");
    // The Add items till never reports a type: it has no switch.
    expect(flow).toContain('if (!reportType || addingTo || token) return;');
  });

  it('Pickup keeps its name: its count on Takeaway, and New order / Pickup under it', () => {
    expect(flow).toContain("t('type.pickupCount', { count: pickupCount })");
    expect(client).toContain("(mode === 'queue' || (mode === 'sell' && tillType === 'takeaway'))");
    // Owner, 2026-11-23 — the waiting count is the amber pill beside the word, not "· 3" in it; the column under it no longer repeats it.
    expect(client).toMatch(/\{t\('pickupTabWord'\)\}\s*<span className=\{`pos-tab-badge\$\{preparingTokens\.length > 0 \? ' is-live' : ''\}`\}>/);
    expect(client).toContain("{tablesBar ? null : <span className=\"pos-queue-col-count\">{preparingTokens.length}</span>}");
    for (const m of [en, hi]) {
      expect(m.payFlow.type.pickupCount).toContain('{count}');
      for (const k of ['more', 'returnBill', 'newOrderTab', 'pickupTab', 'pickupTabWord', 'takeawayViews']) expect(m.pos[k], k).toBeTruthy();
    }
    expect(en.payFlow.type.pickupCount).toBe('Pickup {count}');
    expect(en.pos.pickupTab).toBe('Pickup · {count}');
    expect(hi.pos.pickupTab).toContain('पिकअप');
  });

  it('at 344px: no card around the row, three words with no icons, every control 44px', () => {
    expect(pos).toMatch(/\.pos-shell\.has-type-bar > \.pos-bar-types \{[^}]*border: 0;/);
    expect(tables).toMatch(/\.pf-type-inbar \.pf-type-icon \{\s*display: none;/);
    expect(pos).toMatch(/\.pos-bar-more \.mnu-kebab-btn\.kebab-btn \{\s*width: 2\.75rem;\s*height: 2\.75rem;/);
    expect(pos).toMatch(/\.pos-pickup-switch \.page-tab \{[^}]*min-height: 2\.75rem;/);
    expect(pos).toMatch(/\.pos-bar-types \.pos-fs-toggle \{\s*min-height: 2\.75rem;/);
  });

  it('Pickup has no second New order button when the switch above already is one', () => {
    expect(client).toMatch(/\{tablesBar \? null : \(\s*<button type="button" className="btn btn-primary pos-queue-new-btn"/);
  });

  it('on a phone: the Takeaway count is a corner badge, its words kept for a screen reader; one shape across the row', () => {
    const tables = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
    expect(flow).toContain('<span className="pf-type-pickup-n" aria-hidden="true">');
    expect(tables).toMatch(/\.pf-type-inbar \.pf-type-pickup-word \{\s*position: absolute;\s*width: 1px;/);
    expect(tables).toMatch(/\.pf-type-inbar \.pf-type-tab \{\s*position: relative;\s*flex: 1 1 auto;\s*padding: 0 var\(--sp-2\);/);
    expect(pos).toMatch(/\.pos-bar-types \.pos-bar-kitchen,\s*\.pos-bar-more \.mnu-kebab-btn\.kebab-btn \{\s*width: 3rem;\s*height: 3rem;/);
  });

  it('New order / Pickup is the level below: words on a hairline, not a second grey tray', () => {
    expect(pos).toMatch(/\.pos-pickup-switch \{[^}]*border-bottom: 1px solid color-mix\(in srgb, var\(--muted\) 45%, var\(--border\)\);[^}]*background: transparent;/);
    expect(pos).toMatch(/\.pos-pickup-switch \.page-tab\.active \{\s*border-bottom-color: var\(--accent-deep\);/);
  });

  it('a phone drops the New takeaway card under the bar; delivery, an order being added to and the laptop keep it', () => {
    expect(flow).toContain("const repeatsTheBar = typeInBar && !wide && !token && orderTab === 'takeaway';");
    expect(flow).toContain('typesHere && !atTable && !addingTo && !waiter && !repeatsTheBar ? (');
  });

  it('the table strip: People (not Guests, which sits above the Guest who pays), 0 not a dash, Seat only as an outline', () => {
    const tables = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
    expect(flow).toContain("<span className=\"field-hint\">{tTables('people')}</span>");
    expect(flow).toContain('{guests ?? 0}</span>');
    expect(flow).toContain("{tTables('seatOnly')}");
    for (const m of [en, hi]) for (const k of ['people', 'peopleSkip', 'seatOnly']) expect(m.posTables[k], k).toBeTruthy();
    expect(en.posTables.people).toBe('People');
    expect(tables).toMatch(/\.pf-seat-btn \{\s*border: 1px solid var\(--accent-deep\);\s*background: var\(--surface\);/);
    expect(tables).toMatch(/\.pf-table-strip\.is-in-bar \{\s*display: grid;/);
  });

  it('the chosen type is filled in the app’s green, white words (it was white on light grey)', () => {
    const tables = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
    expect(tables).toMatch(/\.pf-type-inbar \.pf-type-tab\.is-on \{\s*background: var\(--accent-deep\);\s*color: #fff;/);
  });

  it('D1 — a locked type stays readable (no opacity) and a laptop shows a padlock on it', () => {
    const tables = readFileSync(resolve(__dirname, '../styles/99-dining-tables.css'), 'utf8');
    const rule = tables.match(/\.pf-type-top \.pf-type-tab\[aria-disabled='true'\] \{[^}]*\}/)![0];
    expect(rule).not.toContain('opacity');
    expect(rule).toContain('color: var(--muted);');
    expect(flow).toContain('<span className="pf-type-lockicon" aria-hidden="true">');
    expect(tables).toMatch(/@media \(min-width: 861px\) \{\s*\.pf-type-lockicon \{\s*display: inline-flex;/);
  });
});

describe('New order / Pickup can be seen (owner, 2026-11-23: "keep the size same but add button color which is selected")', () => {
  const css = readFileSync(new URL('../styles/99-pos.css', import.meta.url), 'utf8');
  it('the chosen one is filled in the soft green with a 3px underline; the size is unchanged', () => {
    expect(css).toMatch(/\.pos-pickup-switch \.page-tab\.active \{\s*border-bottom-color: var\(--accent-deep\);\s*background: var\(--accent-soft\);/);
    expect(css).toContain('border-bottom: 3px solid transparent;');
    expect(css).not.toMatch(/\.pos-pickup-switch \.page-tab \{[^}]*font-size/);
    expect(css).toContain('border-bottom: 1px solid color-mix(in srgb, var(--muted) 45%, var(--border));');
  });
});

describe('the paid screen has no bar and no New order / Pickup (owner, 2026-11-23)', () => {
  it('Pickup\'s paid screen and the till\'s own both hide them; the bar stays mounted so the switch keeps its slot', () => {
    expect(client).toContain("tablesBar && (mode === 'queue' || payingTable !== null ? settledReceipt !== null : mode === 'sell' && sellAside === 'paid' && addingToToken === null);");
    expect(client).toContain('<div className="pos-bar pos-bar-types" hidden={barAside}>');
    expect(client).toContain('tablesBar && !paidScreen && orderQueue');
    expect(client).toContain('onBarAside: setSellAside');
    // "How did they pay?" too: the bar goes, New order / Pickup stay (owner, 2026-11-23: "hide it there too").
    expect(client).toContain("const barAside = paidScreen || (tablesBar && mode === 'sell' && sellAside === 'paying' && addingToToken === null);");
    expect(flow).toContain("step === 'how' || step === 'qr' ? 'paying' : null;");
    expect(flow).toContain("const aside = step === 'done' && sale !== null ? 'paid'");
    expect(pos).toMatch(/\.pos-shell > \.pos-bar-types\[hidden\] \{\s*display: none;/);
  });

  it('the orders still waiting are said on the way back: "Back to pickup (2)"', () => {
    expect(client).toContain("t('backToPickupWaiting', { count: preparingTokens.length })");
    expect(en.pos.backToPickupWaiting).toBe('Back to pickup ({count})');
    expect(hi.pos.backToPickupWaiting).toContain('{count}');
  });
});
