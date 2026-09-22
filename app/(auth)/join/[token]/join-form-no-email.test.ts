import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-63 · GRW-198 — a login is a phone number, so the join screen asks
 * for no email. Moved here from
 * test/integration/login-is-a-phone-number.integration.test.ts (Jira GRW-370);
 * the API's request-shape checks stay there. Comments are stripped first: an
 * assertion that cannot tell code from prose about the code is not asserting
 * about the code.
 */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const readRaw = (rel: string) => readFileSync(path.join(webRoot, rel), 'utf-8');
const read = (rel: string) =>
  readRaw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('the join screen', () => {
  it('the join screen has no email field', () => {
    const form = read('app/(auth)/join/[token]/JoinForm.tsx');
    expect(form).not.toMatch(/type="email"/);
    expect(form).not.toMatch(/autoComplete="email"/);
    // And it still says what somebody WILL sign in with (the sentence lives in the message file since GRW-361).
    expect(form).toMatch(/t\('setPassword'/);
    const messages = JSON.parse(readRaw('messages/en.json')) as { auth: { join: { setPassword: string } } };
    expect(messages.auth.join.setPassword).toMatch(/sign in with that number/);
  });
});
