import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The Give to stylist sheet: stylists first, then (only when the token has no services) services or a package. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = code('./GiveToStaffSheet.tsx');
const css = read('../../styles/83-role-home.css');

describe('the Give to stylist sheet', () => {
  it('opens on the stylists, by name, with no second screen when a stylist is clicked', () => {
    expect(sheet).toMatch(/<ul className="hm-rows hm-pick">/);
    // One screen still: the services sit above the stylist list, not behind a step of their own.
    expect(sheet).not.toMatch(/chosen \? \(/);
  });

  it('clicking a stylist selects them first, and the Start button starts the visit', () => {
    expect(sheet).toMatch(/const choose = \(p: Provider\) => \{\s*setChosen\(p\);\s*setError\(null\);\s*\};/);
    expect(sheet).toMatch(/const isSelected = chosen\?\.id === p\.id;/);
    expect(sheet).toMatch(/className=\{`hm-row hm-row-button \$\{isSelected \? 'is-selected' : ''\}`\}/);
    expect(sheet).toMatch(/aria-pressed=\{isSelected\}/);
    expect(sheet).toMatch(/className="btn hm-give-go"/);
    expect(sheet).toMatch(/disabled=\{saving !== null \|\| chosen === null \|\| \(needsServices && picked\.length === 0\)\}/);
    expect(sheet).toMatch(/onClick=\{\(\) => chosen && void give\(chosen\.id\)\}/);
    expect(sheet).toMatch(/\{chosen \? `\$\{t\.startBtn\} · \$\{chosen\.displayName\}` : t\.startBtn\}/);
  });

  /**
   * QA, 2026-10-17 — this used to assert `if (all[0]) setPicked([all[0].id])`, which started the visit on whatever
   * service the API listed first: never shown, impossible to change, wrong duration and wrong bill. A token issued
   * by name alone asks what they are having.
   */
  it('when a token was issued with no services, the desk picks them — nothing is chosen for it', () => {
    expect(sheet).not.toMatch(/setPicked\(\[all\[0\]/);
    expect(sheet).toMatch(/\{needsServices && services !== null && services\.length > 0 \? \(/);
    expect(sheet).toMatch(/className=\{`wi-chip \$\{on \? 'wi-chip-on' : ''\}`\}/);
    // And Start stays shut until one is picked.
    expect(sheet).toMatch(/\(needsServices && picked\.length === 0\)\}/);
  });

  it('keeps Client left and Record payment in the footer', () => {
    expect(sheet).toMatch(/<div className="hm-give-foot hm-sheet-close">/);
    expect(sheet).toMatch(/\{t\.theyLeft\}/);
    expect(read('../../lib/home-copy.ts')).toContain("theyLeft: S('Client left', 'ग्राहक चले गए')");
  });

  it('a long "busy with" client name gives way, not the stylist row, and highlights the selected stylist row', () => {
    expect(css).toMatch(/\.hm-pick \.hm-pill \{[^}]*max-width: 58%;[^}]*text-overflow: ellipsis;/);
    expect(css).toMatch(/\.hm-pick \.hm-row-main \{\s*flex: 1 1 0;\s*min-width: 0;/);
    expect(css).toMatch(/\.hm-pick \.hm-row-button\.is-selected button \{/);
  });
});

