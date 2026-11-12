import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { testBusinessesLine } from './dashboard-config';

/** QA loopholes L1–L5, 11 Nov 2026. */
const card = readFileSync(join(__dirname, 'components/TestBusinessCard.tsx'), 'utf8');
const notes = readFileSync(join(__dirname, 'components/SupportNotes.tsx'), 'utf8');
const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

describe('L1 — the Test business switch cannot quietly hide a business', () => {
  it('asks why before it saves, and sends the reason', () => {
    expect(card).toContain('reasonRequired');
    expect(card).toContain('JSON.stringify({ isTest: next, reason })');
    expect(card).not.toMatch(/onClick=\{flip\}/);
  });

  it('shows the API’s refusal in the dialog (a business that has paid)', () => {
    expect(card).toContain('error={error}');
  });

  it('the dashboard says how many test businesses it leaves out, linked to them', () => {
    expect(testBusinessesLine(1)).toBe('1 test business not counted');
    expect(testBusinessesLine(3)).toBe('3 test businesses not counted');
    expect(page).toContain('href="/admin/businesses?test=1"');
    expect(page).toMatch(/data\.testBusinesses \? \(/);
  });
});

describe('L3 — a support note can be removed, and the removal shows', () => {
  it('Remove needs a reason and calls the DELETE route', () => {
    expect(notes).toContain("method: 'DELETE', body: JSON.stringify({ reason })");
    expect(notes.slice(notes.indexOf('title="Remove this note?"'))).toContain('reasonRequired');
  });

  it('a removed note shows who, when and why instead of its words, and offers no Remove', () => {
    expect(notes).toContain('Removed by {n.removed.by}');
    expect(notes).toContain('canWrite && !n.removed');
  });
});

describe('L2, L4, L5 — QA loopholes, 11 Nov 2026', () => {
  const toolbar = readFileSync(join(__dirname, 'components/BusinessesToolbar.tsx'), 'utf8');
  const list = readFileSync(join(__dirname, 'businesses/page.tsx'), 'utf8');
  const parts = readFileSync(join(__dirname, 'components/DashboardParts.tsx'), 'utf8');

  it('L2 — the Test business card says Growza does not bill it', () => {
    expect(card).toContain('Growza does not bill it or chase it for payment');
  });

  it('L4 — Export CSV is there only for an admin who may download the list', () => {
    expect(list).toContain("canExport={can('admin.business.export')}");
    expect(toolbar).toMatch(/\{canExport \? \(/);
  });

  it('L4 — the week’s downloads are a notification with its own words', () => {
    expect(parts).toContain('list_exports: {');
  });
});
