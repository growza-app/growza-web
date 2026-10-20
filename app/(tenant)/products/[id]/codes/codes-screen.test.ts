import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-618 — the marketplace-codes screen, pinned at the source.
 *
 * What was checked in a browser at 344px (a card per size, the codes as chips, the paste, a taken code with its way to move it)
 * is in the PR. These keep the rules that must not drift: the server decides what is valid, the save is one request, the words
 * are plain, and a size with no code is obvious.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const screen = here('./CodesScreen.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../../styles/99-codes.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../../messages', `${lang}.json`), 'utf8')).products.codes as Record<string, unknown>;

describe('the server decides; the screen only shows its answer', () => {
  it('validates nothing about a code itself: no format, no uniqueness check of its own', () => {
    expect(screen).not.toMatch(/\.test\(|RegExp|toLowerCase\(\)\s*===/);
    expect(screen).toContain("error.code === 'code_taken'");
  });

  it('a taken code says which size it already points at (the server’s words) and offers to move it, deliberately', () => {
    expect(screen).toContain('movable');
    expect(screen).toContain('replace: replace || undefined');
    expect(screen).toContain("t('moveHere')");
  });

  it('a paste is ONE request for the whole list, and a refusal names the line the person pasted', () => {
    expect(screen.match(/api\.saveMarketplaceCodes\(/g)).toHaveLength(2); // one add, one paste — never a call per pasted row
    expect(screen).toContain('rows: parsed.rows.map(');
    expect(screen).toContain("t('paste.refused', { line: row.line");
    // The server's own words name the code; the screen swaps its 'Row n' for the line the person pasted, once.
    expect(screen).toContain("replace(/^Row \\d+: /, '')");
    expect(screen).not.toMatch(/for \(const .* of parsed\.rows\)[\s\S]{0,80}saveMarketplaceCodes/);
  });

  it('a double tap saves once', () => {
    expect(screen).toContain('if (code === \'\' || inFlight.current) return;');
    expect(screen).toContain('disabled={busyKey !== null');
  });
});

describe('the unmapped sizes are obvious (FR-05) and a retired size’s code is kept (FR-06)', () => {
  it('a size with no code says so on its own card, and the summary leads with how many', () => {
    expect(screen).toContain("t('noCode')");
    expect(screen).toContain("t('someMissing'");
    expect(css).toMatch(/\.mpc-row:has\(\.mpc-none\)\s*\{[^}]*border-style:\s*dashed/);
  });

  it('codes on a retired size are listed apart, with a way to remove them, never silently dropped', () => {
    expect(screen).toContain('rows.orphans.length > 0');
    expect(screen).toContain("t('retiredBadge')");
  });

  it('the newest channel asked for wins, so a slow answer for the one the person left cannot draw over the one they are on', () => {
    expect(screen).toContain('const seq = ++loadSeq.current');
    expect(screen).toContain('if (seq === loadSeq.current) setCodes(all)');
  });
});

describe('the screen', () => {
  it('is the Products screen’s: guarded the same, and bounced to Products when sizes are not switched on', () => {
    expect(page).toContain("guardScreen('/products')");
    expect(page).toContain("redirect('/products')");
  });

  it('has loading (skeleton rows), error (retry) and empty (a line, with the paste box ready) states', () => {
    expect(screen).toContain('mpc-skeleton');
    expect(screen).toContain("t('retry')");
    expect(screen).toContain("t('noneYet'");
  });

  it('says "Flipkart code" and "Amazon code", with the trade term small beside it — never FSN or ASIN as the main word', () => {
    const en = messages('en');
    expect(en.flipkart).toBe('Flipkart');
    expect(en.flipkartTrade).toMatch(/FSN/);
    for (const k of ['addPlaceholder', 'noCode', 'add', 'moveHere', 'noneYet', 'allMapped', 'someMissing']) expect(String(en[k]), k).not.toMatch(/FSN|ASIN|SKU|variant/i);
  });

  it('has every string in English and Hindi, with the same keys and the same placeholders', () => {
    const en = messages('en');
    const hi = messages('hi');
    const flat = (o: Record<string, unknown>, p = ''): Record<string, string> =>
      Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v]] : Object.entries(flat(v as Record<string, unknown>, `${p}${k}.`)))));
    const fe = flat(en);
    const fh = flat(hi);
    expect(Object.keys(fh).sort()).toEqual(Object.keys(fe).sort());
    const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(fe)) {
      expect(fh[k], k).toBeTruthy();
      expect(slots(fh[k]!), k).toEqual(slots(fe[k]!));
    }
  });

  it('draws with tokens and rem: no pixel font-size but the 16px that stops iOS zooming a field, no animation, thumb-tall controls', () => {
    expect(css.replace(/font-size:\s*16px/g, '')).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(css).toMatch(/\.mpc-chip-x\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.mpc-save\s*\{[^}]*min-height:\s*3rem/);
  });
});
