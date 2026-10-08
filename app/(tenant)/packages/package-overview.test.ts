import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

/**
 * Found on prod, 2026-10-08: the ⋮ menu stayed open after a tap elsewhere (it only closed on mouseleave, which a
 * finger never fires), and tapping a package did nothing — only a double-click opened it.
 */
describe('packages: menu closes on an outside press, a tap opens the contents', () => {
  it('the shared anchored panel closes on a press outside it and on Escape', () => {
    const hook = read('../lib/useAnchoredPanel.ts');
    expect(hook).toContain("addEventListener('pointerdown'");
    expect(hook).toContain("e.key === 'Escape'");
    // The press that closes it must not also act on what is underneath.
    expect(hook).toContain("addEventListener('click', swallow");
  });

  it('a package row opens the overview, except from its own ⋮', () => {
    const list = read('./PackagesList.tsx');
    expect(list).toContain('setViewId(pkg.id)');
    // The overview waits out the double-click window, so a double-click still reaches the editor.
    expect(list).toContain('setTimeout(() => setViewId(pkg.id), 250)');
    expect(list).toMatch(/onDoubleClick=\{[^}]*cancelOpen\(\)/s);
    expect(list).toContain(".closest('.pkg-actions')");
    expect(list).toContain('<PackageOverview');
  });

  it('the overview is a dialog and offers Edit only when the screen is writable', () => {
    expect(read('./PackageOverview.tsx')).toContain('role="dialog"');
    expect(read('./PackagesList.tsx')).toContain('editHref={writable ?');
  });
});
