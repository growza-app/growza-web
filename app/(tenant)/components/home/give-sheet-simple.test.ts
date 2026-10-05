import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The Give to stylist sheet: stylists first, then (only when the token has no services) services or a package. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = code('./GiveToStaffSheet.tsx');
const css = read('../../styles/83-role-home.css');

describe('the Give to stylist sheet', () => {
  it('opens on the stylists, by name, with no services above them', () => {
    expect(sheet).toMatch(/const second = needsServices && chosen !== null;/);
    // The services block is only drawn in the second step.
    const secondStep = sheet.slice(sheet.indexOf('second ? ('), sheet.indexOf(') : (\n          <ul className="hm-rows hm-pick">'));
    expect(secondStep).toMatch(/hm-give-services/);
    expect(sheet.slice(sheet.indexOf('<ul className="hm-rows hm-pick">'))).not.toMatch(/wi-chip/);
  });

  it('a token that already has services is given at the tap; one without asks next', () => {
    expect(sheet).toMatch(/if \(needsServices\) \{\s*setChosen\(p\);[\s\S]*?\} else \{\s*void give\(p\.id\);/);
  });

  it('the second step has services, packages that fill them in, and one Give button that needs a pick', () => {
    expect(sheet).toMatch(/t\.packagesLabel/);
    expect(sheet).toMatch(/t\.servicesLabel/);
    expect(sheet).toMatch(/className="btn hm-give-go" disabled=\{saving !== null \|\| picked\.length === 0\}/);
    expect(sheet).toMatch(/t\.giveToName\(chosen\.displayName\)/);
  });

  it('a package is its services — only packages whose services the branch has are offered', () => {
    expect(sheet).toMatch(/o\.serviceIds\.every\(\(id\) => \(services \?\? \[\]\)\.some\(\(sv\) => sv\.id === id\)\)/);
    expect(sheet).toMatch(/o\.comboPriceMinor !== null/);
  });

  it('can go back to the stylists, and keeps They left / Record payment on the first step only', () => {
    expect(sheet).toMatch(/aria-label=\{t\.changeStylist\}/);
    expect(sheet).toMatch(/\{second \? null : <div className="hm-give-foot hm-sheet-close">/);
  });

  it('a long "busy with" client name gives way, not the stylist row', () => {
    expect(css).toMatch(/\.hm-pick \.hm-pill \{[^}]*max-width: 58%;[^}]*text-overflow: ellipsis;/);
    expect(css).toMatch(/\.hm-pick \.hm-row-main \{\s*flex: 1 1 0;\s*min-width: 0;/);
  });
});
