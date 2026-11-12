import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** QA 10 Nov 2026 — the admin's business page on a phone: Suspend was the first big button, and the payments switch had no track. */
const src = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const page = src('../businesses/[id]/page.tsx');
const dialog = src('ConfirmDialog.tsx');

describe('Suspend lives in a Danger zone, last on the page, behind the business name', () => {
  it('is gone from the top of the page and offered only at the bottom', () => {
    const header = page.slice(page.indexOf('function SummaryHeader'));
    expect(header).not.toContain("onRequestAction('suspend')");
    expect(page).toContain('<SectionTitle title="Danger zone" />');
    expect(page.indexOf('Danger zone')).toBeGreaterThan(page.indexOf("activeTab === 'audit' ? <AuditLogList"));
    expect(page).toContain("onClick={() => setPendingAction('suspend')}");
  });

  it('asks for the business name before Suspend works', () => {
    expect(page).toContain("confirmText={pendingAction === 'suspend' ? business.name : undefined}");
    expect(dialog).toContain("const typedMissing = confirmText !== undefined && typed.trim().toLowerCase() !== confirmText.trim().toLowerCase();");
    expect(dialog).toMatch(/if \(loading \|\| typedMissing\) return;/);
  });
});

describe('a switch keeps its track beside long text', () => {
  it('never shrinks', () => {
    const toggle = src('primitives.tsx');
    expect(toggle.slice(toggle.indexOf('export function Toggle'))).toMatch(/width: 46,\s*height: 26,[\s\S]*?flexShrink: 0,/);
  });
});
