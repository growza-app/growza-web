import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The Give to stylist sheet: stylists first, then (only when the token has no services) services or a package. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = code('./GiveToStaffSheet.tsx');
const css = read('../../styles/83-role-home.css');

describe('the Give to stylist sheet', () => {
  it('opens on the stylists, by name, with no services screen when a stylist is clicked', () => {
    expect(sheet).not.toMatch(/hm-give-services/);
    expect(sheet).not.toMatch(/wi-chip/);
    expect(sheet).toMatch(/<ul className="hm-rows hm-pick">/);
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

  it('when a token was issued with no services, pre-selects the branch default service so Start works in one step', () => {
    expect(sheet).toMatch(/if \(all\[0\]\) setPicked\(\[all\[0\]\.id\]\);/);
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

