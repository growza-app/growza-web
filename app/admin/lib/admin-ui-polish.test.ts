import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatAuditAction } from './audit-fields';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('Admin UI polish — layout, mobile density, filter clarity and live usage', () => {
  it('1. Desktop sidebar fits all 13 items at 840px laptop height via compact spacing', () => {
    const css = read('admin.css');
    const shell = read('components/AdminShell.tsx');
    expect(css).toMatch(/\.admin-sidebar \{[\s\S]*?padding: 14px 12px;/);
    expect(shell).toMatch(/className="admin-nav-group-label"/);
    expect(shell).toMatch(/padding: '6px 12px 2px'/);
    expect(shell).toMatch(/padding: '5px 12px'/);
  });

  it('2. Mobile Platform Users role select spans full card width so it never collides with Added date on 344px phones', () => {
    const css = read('admin.css');
    expect(css).toMatch(/\.admin-table\[data-layout='cards'\] \.admin-cell:has\(select\) \{\s*grid-column: 1 \/ -1;/);
    expect(css).toMatch(/\.admin-table\[data-layout='cards'\] \.admin-cell select \{[\s\S]*?max-width: 100% !important;/);
  });

  it('3. Mobile Quick Actions uses a balanced 2x2 grid at <=359px so the 4th tile is not orphaned', () => {
    const css = read('admin.css');
    const narrow = css.slice(css.indexOf('@media (max-width: 359px)'));
    expect(narrow).toMatch(/\.admin-quick-grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it('4. Filter dropdowns name their dimension instead of showing bare "All"', () => {
    expect(read('businesses/page.tsx')).toMatch(/label: 'All verticals'/);
    expect(read('businesses/page.tsx')).toMatch(/label: s === ALL \? 'All statuses' : statusLabel\(s\)/);
    expect(read('subscriptions/page.tsx')).toMatch(/label: s === 'All' \? 'All statuses' : subscriptionStatusLabel\(s\)/);
    expect(read('invoices/page.tsx')).toMatch(/label: s === 'All' \? 'All payments' : billingStatusLabel\(s\)/);
    expect(read('payments/page.tsx')).toMatch(/label: s === 'All' \? 'All statuses' : billingStatusLabel\(s\)/);
  });

  it('5. Business detail summary strip uses 2-column mobile grid and single-line Created date', () => {
    const css = read('admin.css');
    const detail = read('businesses/[id]/page.tsx');
    expect(css).toMatch(/\.admin-summary-grid \{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(min\(118px, calc\(50% - 8px\)\), 1fr\)\);/);
    expect(detail).toMatch(/className="admin-summary-grid"/);
    expect(detail).toMatch(/<SummaryField label="Created" value=\{formatTimestampDate\(business\.createdAt\)\} hint=\{formatDateTime\(business\.createdAt\)\} \/>/);
  });

  it('6. formatAuditAction translates raw dot-separated keys into readable labels and falls back cleanly', () => {
    expect(formatAuditAction('appointment.walk_in')).toBe('Walk-in recorded');
    expect(formatAuditAction('appointment.corrected')).toBe('Booking corrected');
    expect(formatAuditAction('business.suspend')).toBe('Business suspended');
    // Jira GRW-695 — an unknown action no longer echoes its code back as words; it reads as a plain fallback.
    expect(formatAuditAction('custom.new_event')).toBe('Account change');
    expect(read('components/AuditLogList.tsx')).toMatch(/formatAuditAction\(row\.action\)/);
    expect(read('businesses/[id]/page.tsx')).toMatch(/formatAuditAction\(row\.action\)/);
  });

  it('7. Businesses list and detail wire real current-period usage from /usage', () => {
    const list = read('businesses/page.tsx');
    const detail = read('businesses/[id]/page.tsx');
    expect(list).toMatch(/adminFetch[\s\S]*?\('\/usage\?pageSize=100'/);
    expect(list).toMatch(/usageByBusiness\[b\.tenantId\]/);
    expect(detail).toMatch(/adminFetch<\{ rows: BusinessUsageSummary\[\] \}>\(`\/usage\?businessId=\$\{params\.id\}&pageSize=1`\)/);
    expect(detail).toMatch(/activeTab === 'usage' \? <UsageTab/);
  });

  it('8. Plans screen hides retired migration-artifact plans by default behind a Show retired toggle', () => {
    const plans = read('plans/page.tsx');
    expect(plans).toMatch(/const \[showRetired, setShowRetired\] = useState\(false\);/);
    expect(plans).toMatch(/Show retired \(\{retiredCount\}\)/);
    expect(plans).toMatch(/plans\.filter\(\(p\) => showRetired \|\| p\.status === 'active'\)/);
  });

  it('9. Settings screen states read-only enforced platform defaults without a fake sample-data preview banner', () => {
    const settings = read('settings/page.tsx');
    expect(settings).not.toMatch(/PreviewBanner/);
    expect(settings).toMatch(/Read-only platform defaults/);
    expect(settings).toMatch(/alignItems: 'stretch'/);
  });

  it('10. Shared primitives use rem-scale classes in admin.css', () => {
    const css = read('admin.css');
    const primitives = read('components/primitives.tsx');
    expect(css).toMatch(/\.admin-card \{[\s\S]*?border-radius: 1rem;[\s\S]*?padding: 1\.25rem;/);
    expect(css).toMatch(/\.admin-btn-primary \{[\s\S]*?height: 2\.5rem;[\s\S]*?font-size: 0\.84375rem;/);
    expect(primitives).toMatch(/className="admin-btn-primary"/);
    expect(primitives).toMatch(/className="admin-btn-secondary"/);
  });
});
