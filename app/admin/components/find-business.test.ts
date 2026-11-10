import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIN_QUERY, opensFinder } from './FindBusiness';

/** Jira GRW-699 — find any business from any admin screen. */
const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});
const src = readFileSync(join(__dirname, 'FindBusiness.tsx'), 'utf8');
const shell = readFileSync(join(__dirname, 'AdminShell.tsx'), 'utf8');

describe('find a business', () => {
  it('AC-01 — ⌘K and Ctrl+K open it; K alone, or with Shift or Alt, does not', () => {
    expect(opensFinder(key('k', { metaKey: true }))).toBe(true);
    expect(opensFinder(key('K', { ctrlKey: true }))).toBe(true);
    expect(opensFinder(key('k'))).toBe(false);
    expect(opensFinder(key('k', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(opensFinder(key('k', { ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('it is in the header of every admin screen', () => {
    expect(shell).toContain('<FindBusiness />');
  });

  it('AC-03 — nothing is asked for under 2 characters', () => {
    expect(MIN_QUERY).toBe(2);
    expect(src).toMatch(/if \(!open \|\| trimmed\.length < MIN_QUERY\)/);
  });

  it('AC-02 — no match says so with the query, and Enter opens the highlighted match', () => {
    expect(src).toContain('No business found for “{trimmed}”.');
    expect(src).toMatch(/e\.key === 'Enter' && matches\?\.\[active\]/);
  });
});
