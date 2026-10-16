import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'MobileNavProvider.tsx'), 'utf8');

describe('the phone drawer after Back (owner, 2026-10-15: "it gets stuck")', () => {
  it('shuts when a page is restored from the back-forward cache', () => {
    expect(src).toMatch(/addEventListener\('pageshow', restored\)/);
    expect(src).toMatch(/if \(!e\.persisted\) return;\s*setOpen\(false\);/);
    // …and is shown again from the server, not from the snapshot (stale figures, and a page that may not answer touches).
    expect(src).toMatch(/window\.location\.reload\(\);/);
  });
  it('shuts when the path changes under a provider that stays mounted', () => {
    expect(src).toMatch(/const pathname = usePathname\(\);/);
    expect(src).toMatch(/setOpen\(false\);\s*\}, \[pathname\]\);/);
  });
});
