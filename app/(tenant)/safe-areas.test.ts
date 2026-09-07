import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-17 — the safe-area rules and the thing that switches them on, kept
 * together.
 *
 * Ten `env(safe-area-inset-*)` rules were written across six stylesheets — the
 * tab bar's padding, the FAB's offset, sheet footers — and **not one of them
 * had ever taken effect**, because `viewport-fit=cover` was set nowhere and
 * without it every inset resolves to 0. They were correct, and dead, and
 * nothing said so.
 *
 * These assertions are cheap and they are the only thing standing between that
 * state and its return: deleting one line in a layout silently switches a dozen
 * rules back off, in a way no screenshot on a notched device would be taken to
 * catch.
 */
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(web, p), 'utf-8');

/**
 * Comments stripped, because this file's first version asserted that
 * `admin/layout.tsx` did not contain `viewportFit: 'cover'` — and it does, in
 * the comment explaining why it is deliberately not set. An assertion that
 * cannot tell code from prose about the code is not asserting about the code.
 */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('viewport-fit is what makes the insets real', () => {
  it('the installable dashboard opts into drawing under the notch', () => {
    expect(code('(tenant)/layout.tsx')).toMatch(/viewportFit:\s*'cover'/);
  });

  it('so does the signed-out chrome — /login and /join are opened on a phone', () => {
    expect(code('(auth)/layout.tsx')).toMatch(/viewportFit:\s*'cover'/);
  });

  it('the admin plane does NOT, and that is deliberate', () => {
    // It has no safe-area padding of its own and is not installable, so
    // covering would push its fixed chrome under the notch — the very bug this
    // story fixes. The comment there explains it; this keeps it true.
    expect(code('admin/layout.tsx')).not.toMatch(/viewportFit:\s*'cover'/);
    expect(read('admin/layout.tsx'), 'if it ever changes, the reasoning should change with it').toMatch(/GRW-17/);
  });
});

describe('the chrome that sits against the device edges', () => {
  const mobile = read('(tenant)/styles/32-customers.css');

  it('the tab bar pads for the home indicator and the side notch', () => {
    const rule = mobile.slice(mobile.indexOf('.bottom-nav {'), mobile.indexOf('.bottom-nav a {'));
    expect(rule).toContain('env(safe-area-inset-bottom)');
    // Landscape puts the notch on a side, where it eats the first and last tab.
    expect(rule).toContain('env(safe-area-inset-left)');
    expect(rule).toContain('env(safe-area-inset-right)');
  });

  it('the header pads for the notch', () => {
    const rule = mobile.slice(mobile.indexOf('  .topbar {'), mobile.indexOf('  .topbar h1 {'));
    expect(rule).toContain('env(safe-area-inset-top)');
  });

  it('the FAB clears the home indicator and the side notch', () => {
    const rule = mobile.slice(mobile.indexOf('  .fab {'), mobile.indexOf('  .fab svg {'));
    expect(rule).toContain('env(safe-area-inset-bottom)');
    expect(rule).toContain('env(safe-area-inset-right)');
  });
});

describe('no inset is written as a bare sum', () => {
  it('padding against a device edge uses max() or calc(), never the raw inset alone', () => {
    /*
     * `padding-top: env(safe-area-inset-top)` collapses to ZERO on every phone
     * without a notch and on every desktop — it silently removes the padding
     * the design asked for. The safe forms are `max(12px, env(...))`, which
     * keeps a floor, and `calc(74px + env(...))`, which adds to one.
     */
    const styles = path.join(web, '(tenant)/styles');
    const offenders: string[] = [];
    for (const f of readdirSync(styles).filter((f) => f.endsWith('.css'))) {
      const text = readFileSync(path.join(styles, f), 'utf-8');
      for (const line of text.split('\n')) {
        if (!line.includes('env(safe-area-inset')) continue;
        if (line.includes('max(') || line.includes('calc(') || line.includes('min(')) continue;
        offenders.push(`${f}: ${line.trim()}`);
      }
    }
    expect(offenders, `bare inset(s) that vanish on a phone without a notch:\n${offenders.join('\n')}`).toEqual([]);
  });
});
