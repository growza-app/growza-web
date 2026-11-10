import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shortId } from './CopyableId';

/** Jira GRW-696 — plain words for support sessions, and a business ID you can read out and copy. */
const admin = join(__dirname, '..');
const sources: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(n) && !n.includes('.test.')) sources.push(p);
  }
};
walk(admin);
const visible = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('View as owner', () => {
  it('AC-01 — no admin screen says "Impersonate" or "IMPERSONATING" to a person', () => {
    const offenders = sources.filter((f) => /['"`>]\s*[^'"`<]*\b(Impersonate owner|IMPERSONATING|Exit impersonation|Impersonation started|Impersonation ended)\b/.test(visible(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('AC-01 — the button reads "View as owner" and the bar reads "Viewing as owner"', () => {
    expect(readFileSync(join(admin, 'businesses/[id]/page.tsx'), 'utf8')).toContain('>View as owner</SecondaryButton>');
    expect(readFileSync(join(admin, 'components/AdminShell.tsx'), 'utf8')).toContain('VIEWING AS OWNER ·');
  });
});

describe('the business ID', () => {
  it('AC-02 — shows its first 8 characters', () => {
    expect(shortId('5bf88d08-b79e-414c-b29e-10183c53600a')).toBe('5bf88d08');
  });

  it('AC-02 / AC-03 — a tap copies the whole id; a blocked clipboard shows it selected instead', () => {
    const src = readFileSync(join(admin, 'components/CopyableId.tsx'), 'utf8');
    expect(src).toContain('navigator.clipboard.writeText(id)');
    expect(src).toMatch(/catch \{\s*setState\('manual'\)/);
    expect(src).toMatch(/if \(state === 'manual'\) input\.current\?\.select\(\)/);
    expect(src).toContain("window.setTimeout(() => setState('idle'), 2000)");
  });
});
