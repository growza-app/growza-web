import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const form = read('ServiceForm.tsx');
const table = read('ServicesTable.tsx');
const rows = read('ServiceRows.tsx');
const side = read('../components/Sidebar.tsx');
const reports = read('../reports/ReportsShell.tsx');

describe('release review, 2026-10-16 — Services', () => {
  it('the inline panel is a region: no Escape and no Tab trap', () => {
    expect(form).toMatch(/useDialog\(sheetRef, \{ onClose: busy \|\| inline \? undefined : onClose, active: !inline \}\);/);
  });
  it('unsaved changes are asked about before another row or category replaces the panel', () => {
    expect(form).toMatch(/onDirtyChange\?\.\(changed\);/);
    expect(table).toMatch(/const unlessDirty = \(go: \(\) => void\) => \(dirty \? setDiscard\(\(\) => go\) : go\(\)\);/);
    expect(table).toMatch(/onPick=\{\(id\) => unlessDirty\(\(\) => setCategoryId\(id\)\)\}/);
    expect(table).toMatch(/t\('discard\.title'\)/);
  });
  it('a suspended business has no editor to open, and the name cell is a real button for everyone else', () => {
    expect(table).toMatch(/writable\s*\?\s*\(s\) =>/);
    expect(rows).toMatch(/className="svc-row-tap"/);
  });
  it('an empty result from the status filter says so; an error on a hidden part switches to it', () => {
    expect(table).toMatch(/deskRows\.length === 0 \? \(/);
    expect(form).toMatch(/if \(next\.name && part !== 'details'\) setPart\('details'\);/);
  });
});

describe('release review, 2026-10-16 — Reports and the sidebar', () => {
  it('"What to do" shows neither the range picker nor Compare', () => {
    expect(reports).toMatch(/\{tab !== 'todo' \? \(\s*<>\s*<div className="rp-range">/);
  });
  it('panel ids come from the position, so Hindi labels cannot collide', () => {
    expect(side).toMatch(/nav-children-\$\{nav\.indexOf\(item\)\}/);
    expect(side).not.toMatch(/replace\(\/\\W\+\/g/);
  });
  it('arriving from another page unfolds the group; a reload keeps the fold; a folded group is still marked current', () => {
    expect(side).toMatch(/if \(from && from !== window\.location\.pathname\)/);
    expect(side).toMatch(/aria-current=\{current && \(!expandable \|\| !expanded\) \? 'page' : undefined\}/);
  });
});
