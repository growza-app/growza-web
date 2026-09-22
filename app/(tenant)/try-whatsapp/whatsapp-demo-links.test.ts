import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-266 · GRW-271 — the Try WhatsApp demo is on for the team, off for salons.
 *
 * The dashboard half: every link to it is behind the flag `/me` sends. Moved
 * here from test/api/whatsapp-demo.test.ts (Jira GRW-370) so the API's tests
 * no longer read dashboard files; the API half stays there.
 */
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file: string) => readFileSync(path.join(webRoot, file), 'utf8');

describe('the dashboard offers it only when /me says it exists', () => {
  it('every menu that links to /try-whatsapp only does so behind whatsappDemo', () => {
    for (const [file, guard] of [
      ['app/(tenant)/components/Sidebar.tsx', /\.\.\.\(whatsappDemo \? \[\{ href: '\/try-whatsapp'/],
      ['app/(tenant)/components/home/OwnerHome.tsx', /\.\.\.\(p\.whatsappDemo \? \[\{ href: '\/try-whatsapp'/],
      ['app/(tenant)/more/page.tsx', /\.\.\.\(whatsappDemo\s*\?\s*\[\s*\{\s*href: '\/try-whatsapp'/],
    ] as const) {
      const source = read(file);
      expect(source, file).toMatch(guard);
      expect(source.match(/'\/try-whatsapp'/g)?.length, `${file}: one link, and it is the guarded one`).toBe(1);
    }
  });

  it('AC-02 — no other screen links to it', () => {
    const allowed = new Set([
      'app/(tenant)/components/Sidebar.tsx',
      'app/(tenant)/components/home/OwnerHome.tsx',
      'app/(tenant)/more/page.tsx',
    ]);
    const hits = execSync(`git ls-files 'app/*.tsx' | xargs grep -l "'/try-whatsapp'" || true`, { cwd: webRoot, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    for (const hit of hits) expect(allowed.has(hit), hit).toBe(true);
  });

  it('the layout and Home pass the flag from /me, defaulting to off', () => {
    expect(read('app/(tenant)/layout.tsx')).toMatch(/whatsappDemo = me\.whatsapp\?\.demo \?\? false/);
    expect(read('app/(tenant)/layout.tsx')).toMatch(/whatsappDemo=\{whatsappDemo\}/);
    expect(read('app/(tenant)/page.tsx')).toMatch(/whatsappDemo=\{me\.whatsapp\?\.demo \?\? false\}/);
  });

  it('AC-02 — a typed-in or bookmarked /try-whatsapp is a not-found page in production', () => {
    expect(read('app/(tenant)/try-whatsapp/page.tsx')).toMatch(/if \(!me\.whatsapp\?\.demo\) notFound\(\);/);
  });
});
