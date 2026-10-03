import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jira GRW-475 — the admin portal's screens. Source-reading, as the other admin component tests. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const users = read('../users/page.tsx');
const payment = read('../components/RecordPaymentModal.tsx');
const panel = read('../components/SubscriptionPanel.tsx');
const layout = read('../layout.tsx');
const css = read('../admin.css');

describe('password reset and role change', () => {
  it('are dialogs, not window.prompt — the password masked and typed twice, the reason required', () => {
    expect(users).not.toMatch(/window\.prompt\(/);
    expect(users.match(/type="password"/g)?.length).toBe(2);
    expect(users).toMatch(/newPassword !== newPasswordAgain/);
  });
});

describe('recording a payment far beyond what is owed', () => {
  it('offers to record it anyway, and only then sends the confirmation', () => {
    expect(payment).toMatch(/err\.code === 'amount_unusually_large'/);
    expect(payment).toMatch(/onClick=\{\(\) => submit\(true\)\}/);
    // Not `onClick={submit}`, which would pass the click event as the confirmation.
    expect(payment).not.toMatch(/onClick=\{submit\}/);
  });
});

describe('discounts', () => {
  it('follow the discount permission, which is what the API checks', () => {
    expect(panel).toMatch(/disabled=\{!canDiscount \|\| terminal\}/);
  });
});

describe('accessibility', () => {
  it('lets the page zoom, and shows where the keyboard is', () => {
    expect(layout).not.toMatch(/maximumScale/);
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid/);
  });
});
