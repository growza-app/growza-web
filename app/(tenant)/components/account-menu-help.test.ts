import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

const here = dirname(fileURLToPath(import.meta.url));
const menu = readFileSync(resolve(here, 'AccountMenu.tsx'), 'utf8');

/**
 * Help was reachable only from the phone's More tab; the sidebar never got the matching row, so on a
 * desktop the screen existed for every role and had no link to it. The account menu is on every screen
 * at every width, so it is the one place that fixes both.
 */
describe('Help in the account menu', () => {
  it('is a link to /help, above the language switch', () => {
    expect(menu).toMatch(/<Link href="\/help" className="acct-item acct-help"/);
    expect(menu.indexOf('href="/help"')).toBeGreaterThan(-1);
    expect(menu.indexOf('href="/help"')).toBeLessThan(menu.indexOf('className="acct-lang"'));
  });

  it('closes the menu when followed — the header survives the navigation', () => {
    expect(menu).toMatch(/href="\/help"[^>]*onClick=\{close\}/);
  });

  it('has its word in both languages, in the namespace the browser already loads', () => {
    expect(en.chrome.account.help).toBe('Help');
    expect(hi.chrome.account.help).toBeTruthy();
    expect(hi.chrome.account.help).not.toBe(en.chrome.account.help);
  });
});
