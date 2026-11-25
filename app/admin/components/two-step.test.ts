import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeQr } from '../../(tenant)/lib/print/qr';
import { isTwoStepAnswer } from './TwoStep';

/** Jira GRW-764 — two-step sign-in in the admin portal. */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('the API answers a sign-in screen understands', () => {
  it('knows the three steps, and nothing else', () => {
    expect(isTwoStepAnswer({ step: 'mfa_code' })).toBe(true);
    expect(isTwoStepAnswer({ step: 'mfa_setup', secret: 'ABCD', otpauthUrl: 'otpauth://totp/x' })).toBe(true);
    expect(isTwoStepAnswer({ step: 'sign_in' })).toBe(true);
    for (const other of [null, undefined, {}, { expiresAt: '2026-11-25T00:00:00Z' }, { step: 'done' }, 'mfa_code']) {
      expect(isTwoStepAnswer(other)).toBe(false);
    }
  });
});

describe('the QR an authenticator scans', () => {
  it('our own encoder holds a real otpauth address for a long phone label (boundary)', () => {
    const url =
      'otpauth://totp/Growza%20Admin%3A%2B919811100001?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Growza%20Admin&algorithm=SHA1&digits=6&period=30';
    const qr = encodeQr(url);
    expect(qr.size).toBeGreaterThan(21);
    expect(qr.modules).toHaveLength(qr.size);
  });
});

describe('the screens', () => {
  const login = read('../login/page.tsx');
  const twoStep = read('./TwoStep.tsx');
  const users = read('../users/page.tsx');
  const shell = read('./AdminShell.tsx');

  it('sign-in swaps to the code step or the set-up step on a right password, and back on "start again"', () => {
    expect(login).toContain("body.step === 'mfa_code'");
    expect(login).toContain("body.step === 'mfa_setup'");
    expect(login).toContain("sendCode(twoStep.kind === 'code' ? 'mfa' : 'mfa/setup', code)");
    expect(login).toContain('if (answer.restart) return backToPassword(answer.message);');
    expect(login).toContain('Back to password');
  });

  it('the code field is six digits, the number pad, and one-time-code autofill', () => {
    expect(twoStep).toContain('inputMode="numeric"');
    expect(twoStep).toContain('autoComplete="one-time-code"');
    expect(twoStep).toContain('maxLength={6}');
    expect(twoStep).toContain(".replace(/\\D/g, '').slice(0, 6)");
  });

  it('the secret is drawn and shown, never stored by the page', () => {
    expect(twoStep).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(login).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });

  it('Users: "Two-step on/off", and Reset authenticator only on someone else who has one, within reach', () => {
    expect(users).toContain("{user.mfaEnrolled ? 'Two-step on' : 'Two-step off'}");
    expect(users).toContain("!isSelf && canManage && user.status === 'active' && user.mfaEnrolled && roleInReach(user.roleId)");
    expect(users).toContain('`/users/${user.id}/mfa-reset`');
  });

  it('the account menu offers to turn it on only while it is off', () => {
    expect(shell).toContain('me && me.mfaEnrolled === false && me.phone');
    expect(shell).toContain('Turn on two-step sign-in');
  });
});
