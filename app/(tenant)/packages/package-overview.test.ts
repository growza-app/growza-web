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

/**
 * Owner, 2026-10-08 — Back on the Packages list went to Edit package. Leaving the editor with `router.push` put the
 * list in the history twice, so the list's Back stepped to the editor it had just left.
 */
describe('leaving the package editor', () => {
  const builder = readFileSync(join(__dirname, 'PackageBuilder.tsx'), 'utf8');
  const code = builder.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('steps back through history, and only pushes the list when there is nothing behind it', () => {
    expect(code).toMatch(/window\.history\.length > 1\) router\.back\(\);\s*else router\.push\('\/packages'\)/);
  });

  it('is the only way out — save, delete, Back and Done all go through it', () => {
    expect(code.match(/router\.push\('\/packages'\)/g)).toHaveLength(1);
    expect(code.match(/leave\(\)|onClick=\{leave\}/g)?.length).toBeGreaterThanOrEqual(4);
  });
});

/** Owner, 2026-10-08 — on a phone the packages are one scroll, no pages; the laptop keeps fitting to the screen. */
describe('the packages list on a phone', () => {
  const list = readFileSync(join(__dirname, 'PackagesList.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('lists every package, with no paging', () => {
    expect(list).toMatch(/const pageItems = phone \? filtered : filtered\.slice\(start, start \+ fitCount\)/);
    expect(list).toMatch(/\{!phone && \(\s*<Pagination/);
  });

  it('keeps the fit-to-screen cursor paging for a laptop', () => {
    expect(list).toMatch(/mode="cursor"/);
  });
});

/** Owner, 2026-10-08 — the third package sat under the bottom bar with nothing to scroll it into view. */
describe('the packages page on a phone scrolls', () => {
  const css = readFileSync(join(__dirname, '../styles/96-packages.css'), 'utf8');
  const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');

  it('opts out of the fit-to-screen page, which is overflow: hidden', () => {
    expect(page).toMatch(/className="page-body page-fit pkg-page"/);
    expect(css).toMatch(/\.page-body\.page-fit\.pkg-page \{\s*overflow-y: auto;/);
  });

  it('leaves the bottom bar\'s height under the last package', () => {
    expect(css).toMatch(/\.page-body\.page-fit\.pkg-page \{[^}]*padding-bottom: calc\(96px/);
  });
});

/** Owner, 2026-10-08 — each service in the overview shows its picture, the same fixed square as everywhere else. */
describe('the package overview shows each service\'s picture', () => {
  const overview = readFileSync(join(__dirname, 'PackageOverview.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const list = readFileSync(join(__dirname, 'PackagesList.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('draws a fixed 36px square, lazy, and only when there is a picture', () => {
    expect(overview).toMatch(/\{s\.photo && \(/);
    expect(overview).toMatch(/className="picker-row-thumb"[^>]*width=\{36\} height=\{36\} loading="lazy" decoding="async"/);
  });

  it('gets the picture from the same chooser the list and the builder use', () => {
    expect(list).toMatch(/photo: servicePhotoUrl\(serviceById\.get\(part\.id\)!\)/);
  });
});
