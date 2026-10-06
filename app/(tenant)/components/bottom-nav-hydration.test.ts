import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const nav = readFileSync(resolve(here, 'BottomNav.tsx'), 'utf8');

/*
 * The speed-dial's scrim is a portal, and a portal occupies a child position whether or not its contents land
 * elsewhere. Gating it on `typeof document` gave the client a child the server had never written, so React lined the
 * menu up against the scrim, called it a hydration mismatch and re-rendered the whole bar on every page load.
 */
describe('the bottom bar hydrates as the server drew it', () => {
  it('does not decide what to render by asking whether `document` exists', () => {
    const code = nav.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    expect(code).not.toMatch(/typeof document/);
  });

  it('waits for the mount before putting the scrim in the body', () => {
    expect(nav).toMatch(/const \[mounted, setMounted\] = useState\(false\)/);
    expect(nav).toMatch(/useEffect\(\(\) => setMounted\(true\), \[\]\)/);
    expect(nav).toMatch(/menu && mounted\s*\n?\s*\? createPortal\(/);
  });
});
