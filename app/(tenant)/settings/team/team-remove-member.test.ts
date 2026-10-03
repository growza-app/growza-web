import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-470 — the Team screen can take a login away.
 *
 * Source-reading, like the other client-component tests here: there is no DOM in this suite, and what matters is
 * that the action exists, asks first, never offers the owner, and calls the route the API added.
 */
const panel = readFileSync(resolve(__dirname, 'TeamAccessPanel.tsx'), 'utf8');
const api = readFileSync(resolve(__dirname, '../../lib/api.ts'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/en.json'), 'utf8')).settingsTeam;
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/hi.json'), 'utf8')).settingsTeam;

describe('removing a team member', () => {
  it('calls DELETE /api/v1/team/members/:userId', () => {
    expect(api).toMatch(/removeTeamMember: \(userId: string\) => del<[^>]*>\(`\/api\/v1\/team\/members\/\$\{userId\}`\)/);
    expect(panel).toMatch(/api\.removeTeamMember\(member\.userId\)/);
  });

  it('asks first, in the danger tone, and shows the server’s reason when refused', () => {
    expect(panel).toMatch(/<ConfirmDialog[\s\S]*?tone="danger"[\s\S]*?onConfirm=\{\(\) => void doRemove\(confirmRemove\)\}/);
    expect(panel).toMatch(/setRemoveError\(e instanceof ApiError \? e\.message/);
  });

  it('never offers the owner — only receptionists and stylists are listed', () => {
    expect(panel).toMatch(/members\.filter\(\(m\) => m\.role === 'receptionist' \|\| m\.role === 'staff'\)/);
  });

  it('has its words in both languages', () => {
    for (const key of ['canSignIn', 'stylist', 'remove', 'removeFor', 'removeTitle', 'removeBody']) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(hi[key], `hi ${key}`).toBeTruthy();
    }
    expect(en.removeTitle).toContain('{name}');
    expect(hi.removeTitle).toContain('{name}');
  });
});
