import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** QA 13 Nov 2026, bug 5 — the salon's Reports bar opened at its start on a phone, leaving the open tab off-screen. */
const shell = readFileSync(new URL('./ReportsShell.tsx', import.meta.url), 'utf8');

describe('the Reports tab bar brings the open tab into view', () => {
  it('centres the active tab whenever the tab changes', () => {
    expect(shell).toContain('<nav ref={tabsRef} className="rp-tabs rp-tabs-top">');
    expect(shell).toContain("const current = nav?.querySelector<HTMLElement>('button.active');");
    expect(shell).toContain('nav.scrollLeft += it.left + it.width / 2 - (bar.left + bar.width / 2);');
    expect(shell).toMatch(/nav\.scrollLeft \+= [^\n]+\n\s*\}, \[tab\]\);/);
  });
});
