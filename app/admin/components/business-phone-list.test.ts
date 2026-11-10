import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jira GRW-694 — Businesses on a phone: one short row each, and Add business within thumb reach. */
const css = readFileSync(join(__dirname, '../admin.css'), 'utf8');
const page = readFileSync(join(__dirname, '../businesses/page.tsx'), 'utf8');
const list = readFileSync(join(__dirname, 'BusinessPhoneList.tsx'), 'utf8');
const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)));

describe('Businesses on a phone', () => {
  it('AC-01 — each row is one link, at least 60px, carrying name, plan and status', () => {
    expect(rule('.admin-phone-row')).toContain('min-height: 60px');
    expect(list).toMatch(/<Link href=\{`\/admin\/businesses\/\$\{b\.tenantId\}`\} className="admin-phone-row">/);
    expect(list).toContain('{b.planName} · {b.vertical}');
    expect(list).toContain('<StatusPill');
  });

  it('AC-03 — a long name truncates on one line instead of pushing the row wider', () => {
    expect(css).toMatch(/\.admin-phone-row-name,\s*\.admin-phone-row-sub \{\s*white-space: nowrap;\s*overflow: hidden;\s*text-overflow: ellipsis;/);
    expect(rule('.admin-phone-row-text')).toContain('min-width: 0');
  });

  it('AC-02 — Add business floats above the tab bar and the home indicator, and the list leaves room for it', () => {
    expect(rule('.admin-fab')).toContain('bottom: calc(76px + env(safe-area-inset-bottom))');
    expect(page).toContain('<div className="admin-fab-clearance" aria-hidden />');
  });

  it('the phone list and the table split at the same 860/861px line as the rest of the admin', () => {
    expect(css).toMatch(/@media \(min-width: 861px\) \{\s*\.admin-fab,\s*\.admin-fab-clearance,\s*\.admin-phone-list \{\s*display: none;/);
    expect(css).toMatch(/@media \(max-width: 860px\) \{\s*\.admin-businesses-table \{\s*display: none;/);
  });
});
