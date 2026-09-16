import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-288 — names people type, at the length the API lets them type.
 *
 * QA found three shapes of one defect, all invisible with the names a dev
 * database usually holds:
 *
 * - an 80-character role name with no spaces scrolled /admin/roles sideways
 *   (305px at 390, 375px at 320, 98px at 861), and on a phone that widened
 *   the layout viewport enough to push the New role dialog's Cancel off it;
 * - a 118-character business name scrolled its detail page 9px at 320px;
 * - the dashboard's Recent signups strip let one long name take the whole
 *   strip, cut mid-word at the card's edge with no ellipsis.
 *
 * And one neighbour: the invoice breakdown at 320px showed "₹79…" because the
 * block kept a 280px minimum inside a 246px card.
 *
 * The device sweep measures these in a browser (with a long-named role seeded
 * by `test/devices/auth.setup.ts`); this pins the rules that fix them, which a
 * later restyle could drop without anything else failing.
 */
const admin = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

describe('a name with no spaces in it can still break', () => {
  const css = admin('admin.css');

  it('headings, paragraphs and `.admin-name` break anywhere — the value that lowers min-content', () => {
    // `break-word` would pass a casual reading and fix nothing: it does not
    // change the min-content width that a flex item refuses to shrink below.
    expect(css).toMatch(
      /\.admin-body h1,\s*\.admin-body h2,\s*\.admin-body h3,\s*\.admin-body h4,\s*\.admin-body p,\s*\.admin-name \{\s*overflow-wrap: anywhere;/,
    );
  });

  it.each([
    ['roles/page.tsx', /className="admin-name"[^>]*>\s*\{role\.name\}/],
    ['users/page.tsx', /className="admin-name"[^>]*>\s*\{user\.name\}/],
    ['businesses/[id]/page.tsx', /className="admin-name"[^>]*>\s*\{business\.name\}/],
    ['businesses/[id]/page.tsx', /className="admin-name"[^>]*>\s*\{l\.name\}/],
    ['plans/page.tsx', /className="admin-name"[^>]*>\s*\{plan\.name\}/],
    ['components/SubscriptionPanel.tsx', /className="admin-name"[^>]*>\s*\{businessName \?/],
    ['invoices/[id]/page.tsx', /className="admin-name"[^>]*>\s*\{businessName \?/],
  ])('%s prints its name in an element that may break', (file, pattern) => {
    expect(admin(file)).toMatch(pattern);
  });

  it('the roles row lets its name column shrink (a flex item defaults to its content width)', () => {
    const roles = admin('roles/page.tsx');
    expect(roles).toMatch(/display: 'flex', alignItems: 'center', gap: 11, minWidth: 0/);
  });

  it('every dialog names its subject in an <h3> or <p>, which the rule above covers', () => {
    // "Edit <role>", "Delete <role>?", "Deactivate <admin>?" — ConfirmDialog and
    // RoleEditor put the title in an h3. If one moves to a <div> it needs
    // `admin-name`, and this is what will say so.
    expect(admin('components/ConfirmDialog.tsx')).toMatch(/<h3[^>]*>\{title\}<\/h3>/);
    expect(admin('roles/RoleEditor.tsx')).toMatch(/<h3 id=\{`\$\{ids\}-title`\}[^>]*>\s*\{role \? `Edit \$\{role\.name\}`/);
  });
});

describe('Recent signups', () => {
  it('ends a long name with an ellipsis, and says the whole name on hover', () => {
    const dashboard = admin('page.tsx');
    const block = dashboard.slice(dashboard.indexOf('Recent signups'));
    expect(block).toMatch(/title=\{signup\.name\}[\s\S]{0,300}textOverflow: 'ellipsis'[\s\S]{0,80}maxWidth: \d+/);
  });
});

describe('the invoice breakdown on a 320px phone', () => {
  const breakdown = admin('components/InvoiceBreakdown.tsx');

  it('has no minimum wider than a 320px card, and no sideways scroller to hide figures in', () => {
    expect(breakdown).not.toMatch(/minWidth: compact \? 240 : 280/);
    expect(breakdown).not.toMatch(/overflowX: 'auto'/);
  });

  it('keeps every amount whole: figures never wrap or shrink, labels give way instead', () => {
    const line = breakdown.slice(breakdown.indexOf('function Line'));
    expect(line).toMatch(/whiteSpace: 'nowrap',\s*flex: 'none'/);
    expect(line).toMatch(/fontWeight: 600, minWidth: 0 \}\}>\{label\}/);
  });
});
