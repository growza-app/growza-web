import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Admin portal audit, batch H (2026-10-09) — sessions. Source-reading, like the other client-component tests in
 * this suite (no DOM).
 */
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('M9 — a sign-out that did not reach the server is not a sign-out', () => {
  const shell = read('components/AdminShell.tsx');
  const signOut = shell.slice(shell.indexOf('async function signOut()'), shell.indexOf('return (', shell.indexOf('async function signOut()')));

  it('clears the session and leaves only after the logout request succeeded', () => {
    expect(signOut).not.toMatch(/finally/);
    expect(signOut).toMatch(/catch \{\s*setSignOutError\('Could not sign you out — you are still signed in\./);
    expect(signOut).toMatch(/return;\s*\}\s*clearAdminSession\(\);\s*router\.push\('\/admin\/login'\);/);
  });

  it('says so beside the button', () => {
    expect(shell).toMatch(/\{signOutError \? \(\s*<div role="alert"/);
  });
});

describe('the session gate', () => {
  const gate = read('components/SessionGate.tsx');

  it('L2 — forgets the portal was ready when it reaches the login page, so Back does not render it', () => {
    expect(gate).toMatch(/if \(isLoginPage\) \{[\s\S]*?setReady\(false\);\s*return;\s*\}/);
  });

  it('L1 — an outage or the throttle is not a sign-out: it says so and offers Try again', () => {
    expect(gate).toMatch(/if \(outcome\.status === 'renewed'\) setReady\(true\);\s*[\s\S]*?else if \(outcome\.status === 'unavailable'\) setUnreachable\(true\);\s*else router\.replace\(LOGIN_PATH\);/);
    expect(gate).toMatch(/Could not reach the sign-in service/);
    expect(gate).toMatch(/onClick=\{\(\) => setAttempt\(\(n\) => n \+ 1\)\}/);
    expect(gate).toMatch(/\}, \[isLoginPage, pathname, router, attempt\]\);/);
  });
});

describe('L3 — your own row offers Change password, not Reset', () => {
  const users = read('users/page.tsx');
  it('Reset is for somebody else; yourself gets the dialog that asks for the current password', () => {
    expect(users).toMatch(/\{isSelf \? \(\s*<SecondaryButton onClick=\{\(\) => setChangingOwnPassword\(true\)\}>Change password<\/SecondaryButton>/);
    expect(users).toMatch(/: canManage && user\.status === 'active' && roleInReach\(user\.roleId\) \? \(\s*<SecondaryButton onClick=\{\(\) => resetPassword\(user\)\}>Reset password/);
    expect(users).not.toMatch(/isSelf \|\| roleInReach/);
    expect(users).toMatch(/<ChangePasswordDialog onClose=\{\(\) => setChangingOwnPassword\(false\)\} \/>/);
  });
});
