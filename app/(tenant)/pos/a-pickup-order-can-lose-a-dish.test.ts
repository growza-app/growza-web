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
    expect(client).toMatch(/\{mayEdit \? \(\s*<button\s+type="button"\s+className="btn pos-qcard-edit-btn"/);
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

  it('44px − and +, and Add items on a row of its own at 344px', () => {
    expect(css).toMatch(/\.pos-qedit-btn \{[^}]*width: 2\.75rem;[^}]*height: 2\.75rem;/);
    expect(css).toMatch(/\.pos-qcard-more:has\(> :nth-child\(3\)\) > \.pos-qcard-add-btn \{\s*flex-basis: 100%;/);
  });

  it('says every word in English and Hindi', () => {
    for (const k of ['editOrder', 'editSave', 'editLess', 'editMore', 'editNow', 'editEverythingOff', 'editReason', 'editSaved', 'editFailed']) {
      expect(en.pos[k], k).toBeTruthy();
      expect(hi.pos[k], k).toBeTruthy();
    }
  });
});
