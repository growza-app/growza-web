import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Jira GRW-747 — owner, 2026-11-22/23: an unpaid takeaway in Pickup could only grow or be cancelled; "keep it simple, should be able to
 * edit in same card". Source pins; the flow itself was checked in a browser at 344px and in e2e spec 41 (growza repo).
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const client = read('./PosClient.tsx');
const edit = read('./PickupCardEdit.tsx');
const helpers = read('./pos-helpers.ts');
const api = read('../lib/api.ts');
const css = read('../styles/99-pos.css');
const en = JSON.parse(read('../../../messages/en.json'));
const hi = JSON.parse(read('../../../messages/hi.json'));

describe('Edit an unpaid Pickup order on its own card', () => {
  it('Edit is the owner’s or a manager’s, beside Add items and Cancel order, and edits in the card (no sheet)', () => {
    expect(client).toContain("const mayEdit = session?.role === 'owner' || session?.role === 'manager';");
    // Owner, 2026-11-23 — + beside Take payment; Edit (owner or manager) and Cancel order in the card's ⋮.
    expect(client).toContain('className="btn pos-qcard-plus-btn"');
    expect(client).toContain("aria-label={t('addItemsTo', { token: tk.tokenLabel })}");
    // The ⋮'s choices open inside the card, never over the card below (owner, 2026-11-23).
    expect(client).toContain('className="btn pos-qcard-kebab-btn"');
    expect(client).toContain('aria-expanded={menuFor === tk.id}');
    expect(client).toContain('<div className="pos-qcard-menu" id={`pos-qcard-menu-${tk.id}`}>');
    expect(client).toContain('className="pos-qcard-menu-item is-danger"');
    expect(client).toContain('{editingId === tk.id ? (\n          <PickupCardEdit');
    expect(client).not.toContain('PickupTakeOffSheet');
  });

  it('a card row knows its bill lines, product and price, so − and + can be saved', () => {
    expect(helpers).toContain('lines?: Array<{ id: string; qty: number }>;');
    expect(helpers).toContain('const line = p.id ? [{ id: p.id, qty: netQty }] : [];');
  });

  it('fewer is taken off line by line with the qty it saw; more is added; no reason is asked', () => {
    expect(edit).toContain("await api.cancelBillItems(token.id, [line.id], reason, askCooked ? cooked : undefined, { qty: take, seenQty: line.qty });");
    expect(edit).toContain('(await api.addToPendingCounterSale(token.id, more)).totalMinor');
    expect(edit).toContain("const reason = t('editReason');");
    expect(api).toContain('...(some ? { qty: some.qty, seenQty: some.seenQty } : {})');
  });

  it('asks "already cooked?" only when the server says so, keeps what was asked for, and never saves an empty order', () => {
    expect(edit).toContain("if (e instanceof ApiError && e.code === 'cooked_unknown') {");
    expect(edit).toContain('if (wrote || (e instanceof ApiError && e.code === \'line_changed\')) await onChanged();');
    expect(edit).toContain('const nothingLeft = rows.every((i) => countOf(i) === 0);');
  });

  it('44px − and + in the editor, and a 44px + and ⋮ beside Take payment', () => {
    expect(css).toMatch(/\.pos-qedit-btn \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
    expect(css).toMatch(/\.pos-qcard-plus-btn,\s*\.pos-qcard-kebab-btn \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
  });

  it('says every word in English and Hindi', () => {
    for (const k of ['addItemsTo', 'moreFor', 'editOrder', 'editSave', 'editLess', 'editMore', 'editNow', 'editEverythingOff', 'editReason', 'editSaved', 'editFailed']) {
      expect(en.pos[k], k).toBeTruthy();
      expect(hi.pos[k], k).toBeTruthy();
    }
  });
});

describe('QA 2026-11-23, finding 1 — Edit never undoes another till', () => {
  it('only a dish tapped here is changed; one nobody touched follows the order as Pickup reads it again', () => {
    expect(edit).toContain('const [want, setWant] = useState<Record<string, number>>({});');
    expect(edit).toContain('const touched = (i: PosTokenItem) => editable(i) && keyOf(i) in want;');
    expect(edit).toContain('if (!touched(i)) continue;');
    expect(edit).toContain('.filter((i) => touched(i) && countOf(i) > i.qty)');
  });

  it('a tapped dish another till changed since is not saved over: it shows as it is now, and says so', () => {
    expect(edit).toContain("if (!(k in base)) setBase((b) => ({ ...b, [k]: i.qty }));");
    expect(edit).toContain('return !now || now.qty !== base[k];');
    expect(edit).toContain("setError(t('editChangedElsewhere', { names }));");
    expect(en.pos.editChangedElsewhere).toContain('{names}');
    expect(hi.pos.editChangedElsewhere).toContain('{names}');
  });
});

describe('QA 2026-11-23, finding 2 — one more of a dish with choices', () => {
  it('a row chosen with add-ons says to use Add items (which asks its choices), and saves no plain copy', () => {
    expect(edit).toContain('if (i.hasAddons && n > Math.max(i.qty, want[k] ?? i.qty)) {');
    expect(edit).toContain("{t('editMoreHasChoices', { name: needsChoices })}");
    expect(read('./pos-helpers.ts')).toContain('hasAddons: p.hasAddons === true,');
    expect(en.pos.editMoreHasChoices).toContain('Add items');
    expect(hi.pos.editMoreHasChoices).toContain(hi.pos.addItems);
  });
});
