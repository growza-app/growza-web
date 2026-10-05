import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-510 — the Day summary button is a plain secondary button with a summary icon.
 * It was a green-tinted square holding a clock-with-arrow; the owner asked for a secondary look and an icon
 * that says "summary".
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('../../styles/83-role-home.css');
const icons = read('../icons.tsx');

describe('the Day summary button', () => {
  it('looks like the other quiet buttons: white, a line border, an ink icon', () => {
    const rule = /@media \(max-width: 860px\) \{\s*\.hm-toolbar-summary \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/border: 1px solid var\(--hm-line\);/);
    expect(rule).toMatch(/background: #fff;/);
    expect(rule).toMatch(/color: var\(--hm-ink\);/);
    expect(rule).not.toMatch(/hm-green/);
    // Jira GRW-511 — icon and text now: at least 44px wide, exactly 44px tall.
    expect(rule).toMatch(/min-width: 44px;\s*height: 44px;/);
  });

  it('carries a document icon, not the clock', () => {
    const icon = /export const IconDaySummary = \(\) => \(([\s\S]*?)\n\);/.exec(icons)?.[1] ?? '';
    expect(icon).toMatch(/<polyline points="14 2 14 8 20 8" \/>/);
    expect(icon).not.toMatch(/M12 3a9 9 0 1 0 9 9/);
  });

  it('says its name beside the icon, and the label may end in an ellipsis (Jira GRW-511)', () => {
    const owner = read('./OwnerHome.tsx');
    expect(owner).toMatch(/<IconDaySummary \/>\s*(?:\{\}\s*)?<span className="hm-toolbar-summary-label">\{t\.daySummary\}<\/span>/);
    expect(css).toMatch(/\.hm-toolbar-summary-label \{[^}]*overflow: hidden;\s*text-overflow: ellipsis;\s*white-space: nowrap;/);
    // It may shrink before it pushes the row off the screen.
    expect(css).toMatch(/\.hm-toolbar-summary \{[^}]*flex: 0 1 auto;/);
  });
});
