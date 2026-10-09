import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin portal audit, batch A (2026-10-09) — nine fixes, each pinned where it lives.
 *
 * H1 runs `adminFetch` for real against a stubbed `fetch`; the rest are source-reading, like the other
 * client-component tests here, because this suite has no DOM.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

vi.mock('./refresh', () => ({ refreshAdminSession: vi.fn(async () => ({ status: 'renewed' })) }));

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('H1 — a wrong current password is not an expired session', () => {
  let href = '';
  beforeEach(() => {
    href = '';
    (globalThis as { window?: unknown }).window = {
      location: {
        get href() {
          return href;
        },
        set href(v: string) {
          href = v;
        },
      },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('reports the refusal once, without renewing, replaying or signing out', async () => {
    const fetch = vi.fn(async () => respond(401, { error: 'invalid_credentials', detail: 'That is not your current password.' }));
    vi.stubGlobal('fetch', fetch);
    const { adminFetch } = await import('./api');
    const { refreshAdminSession } = await import('./refresh');

    await expect(adminFetch('/auth/change-password', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
      message: 'That is not your current password.',
    });
    expect(fetch).toHaveBeenCalledTimes(1); // one failure against the throttle, not two
    expect(refreshAdminSession).not.toHaveBeenCalled();
    expect(href).toBe('');
  });

  it('still renews and replays a 401 that IS about the session', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(401, { error: 'unauthorized' }))
      .mockResolvedValueOnce(respond(200, { ok: true }));
    vi.stubGlobal('fetch', fetch);
    const { adminFetch } = await import('./api');
    const { refreshAdminSession } = await import('./refresh');

    await expect(adminFetch('/me')).resolves.toEqual({ ok: true });
    expect(refreshAdminSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('L4 — the change-password backdrop waits for the request', () => {
  it('cannot close the dialog while saving, same as Escape', () => {
    const src = read('components/ChangePasswordDialog.tsx');
    // The backdrop is the element right before the dialog itself; the Cancel button is disabled while busy and
    // Close only appears once the change is done, so neither needs this guard.
    const backdrop = src.slice(src.indexOf('<>'), src.indexOf('role="dialog"'));
    expect(backdrop).toMatch(/onClick=\{busy \? undefined : onClose\}/);
    expect(backdrop).not.toMatch(/onClick=\{onClose\}/);
  });
});

describe('H2 — a discount save re-reads the subscription', () => {
  it('reloads instead of merging a reply that lacks nextBill', () => {
    const src = read('components/SubscriptionPanel.tsx');
    const block = src.slice(src.indexOf('<DiscountModal'), src.indexOf('<ReenrolModal'));
    expect(block).toMatch(/onSaved=\{\(\) => \{[\s\S]*?void load\(\);/);
    expect(block).not.toMatch(/setSubscription\(\(prev\)/);
  });
});

describe('H3 — re-enrolling lands on the subscription it created', () => {
  const panel = read('components/SubscriptionPanel.tsx');
  it('the result carries the subscription the API returns', () => {
    expect(read('components/ReenrolModal.tsx')).toMatch(/export interface ReenrolResult \{[\s\S]*?subscription: \{ id: string \};/);
  });
  it('the panel hands a NEW subscription to its host instead of reloading the old one', () => {
    expect(panel).toMatch(
      /if \(onReplaced && result\.created && result\.subscription\.id !== subscriptionId\) onReplaced\(result\.subscription\.id\);\s*else void load\(\);/,
    );
  });
  it('the subscription page moves to it', () => {
    expect(read('subscriptions/[id]/page.tsx')).toMatch(/onReplaced=\{\(id\) => router\.replace\(`\/admin\/subscriptions\/\$\{id\}`\)\}/);
  });
});

describe('L7 — the re-enrol dialog arms its keyboard handling when it opens', () => {
  it('passes active: open, as RecordPaymentModal does', () => {
    expect(read('components/ReenrolModal.tsx')).toMatch(/useDialog\(dialogRef, \{ onClose: saving \? undefined : onClose, active: open \}\)/);
  });
});

describe('M2 — the suspend dialog says what suspension does', () => {
  const src = read('businesses/[id]/page.tsx');
  it('says users can still sign in, read-only', () => {
    expect(src).not.toMatch(/will not be able to sign in/);
    expect(src).toMatch(/can still sign in and look at everything, but cannot change anything except pay the bill/);
  });
  it('reactivate no longer promises sign-in comes back — it never went', () => {
    expect(src).not.toMatch(/Dashboard sign-in and proactive WhatsApp messages resume/);
  });
});

describe('M7 — part-paid invoices', () => {
  it('can be filtered for, and read as words in an amber pill', async () => {
    const { INVOICE_PAYMENT_STATUS_VALUES, billingStatusLabel } = await import('./billing-status');
    expect(INVOICE_PAYMENT_STATUS_VALUES).toContain('PARTIALLY_PAID');
    expect(billingStatusLabel('PARTIALLY_PAID')).toBe('Part paid');
    const { STATUS_COLORS } = await import('../tokens');
    expect(STATUS_COLORS['Part paid']).toEqual(STATUS_COLORS.Unpaid);
  });
});

describe('L5 — a large-amount confirmation answers one figure', () => {
  const src = read('components/RecordPaymentModal.tsx');
  it('is cleared when the modal opens', () => {
    const seed = src.slice(src.indexOf('openedFor.current = subscription.id;'), src.indexOf('}, [open, subscription]);'));
    expect(seed).toMatch(/setNeedsConfirm\(false\);/);
  });
  it('is cleared when the amount changes', () => {
    expect(src).toMatch(/setAmount\(e\.target\.value\);\s*\/\/[^\n]*\n\s*setNeedsConfirm\(false\);/);
  });
});

describe('L6 — a percent discount must be whole', () => {
  const src = read('components/DiscountModal.tsx');
  it('blocks save on 12.5 and says why', () => {
    expect(src).toMatch(/const notWholePercent = type === 'percent' && value\.trim\(\) !== '' && !Number\.isInteger\(Number\(value\)\);/);
    expect(src).toMatch(/const canSave = [^;]*!notWholePercent[^;]*;/);
    expect(src).toMatch(/Use a whole number — for example 12 or 13, not 12\.5\./);
  });
});
