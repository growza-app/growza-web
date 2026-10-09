import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Jira GRW-461 — the stylist list offers only the people who can do what was picked.
 *
 * GRW-456 fixed a branch with NOBODY on it. The same refusal still came from a branch that HAS staff, none of
 * whom offer the picked service: `booking.controller.ts` chooses the chair with `listProvidersForService` on
 * the first picked service and answers 400 "No staff member can perform that service" when nothing comes
 * back. The sheet loaded `api.providers()` once on open — every stylist in the business, whatever they can do
 * — and filtered only by branch, so it offered Nisha for Hair Botox, said "1 free", and the save refused.
 *
 * The route side is `test/integration/providers-for-service.integration.test.ts`, against a real database.
 * These are source-reading, as the other `NewVisitSheet` suites are: it is a client component with no DOM
 * here, and the browser pass is on qa377.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
/** Without its prose: the comments explaining this change quote the state they replaced. */
const code = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const api = readFileSync(resolve(__dirname, '../lib/api.ts'), 'utf8');

describe('asking who can do it', () => {
  it('the client can ask the route for one service', () => {
    expect(api).toMatch(/providers: \(opts\?: \{ service\?: string; location\?: string \| null \}\)/);
    expect(api).toMatch(/q\.set\('service', opts\.service\)/);
  });

  it('asks for the FIRST picked service, which is what the save asks', () => {
    // Not every picked service: a multi-service walk-in runs on one chair and is sorted out at checkout, so
    // demanding somebody who can do the whole basket would refuse visits the server would have accepted.
    expect(code).toMatch(/const firstServiceId = picked\[0\]\?\.serviceId \?\? null/);
    expect(code).toMatch(/\.providers\(\{ service: firstServiceId, location: listBranch \}\)/);
  });

  it('re-asks when the service or the branch changes', () => {
    const effect = code.slice(code.indexOf('const firstServiceId'));
    expect(effect.slice(0, 700)).toMatch(/\}, \[later, firstServiceId, listBranch\]\)/);
  });

  it('does not ask for a booking, which goes through availability instead', () => {
    const effect = code.slice(code.indexOf('const firstServiceId'));
    expect(effect.slice(0, 300)).toMatch(/if \(later \|\| !firstServiceId\)/);
  });

  it('a failed ask is "not answered", never "nobody"', () => {
    // `null` must not empty the chair list — that would invent the very refusal this story removes.
    expect(code).toMatch(/const \[skilled, setSkilled\] = useState<Set<string> \| null>\(null\)/);
    const katch = code.slice(code.indexOf('.providers({ service: firstServiceId'));
    expect(katch.slice(0, 500)).toMatch(/\.catch\(\(\) => \{\s*if \(!cancelled\) setSkilled\(null\)/);
    expect(code).toMatch(/const ableProviders = skilled === null \? branchProviders : branchProviders\.filter\(\(p\) => skilled\.has\(p\.id\)\)/);
  });
});

describe('what the stylist step then offers', () => {
  it('lists only the people who can do it', () => {
    expect(code).toMatch(/\{ableProviders\.map\(\(p\) => \{/);
    expect(code).not.toMatch(/\{branchProviders\.map\(\(p\) => \{/);
  });

  it('counts "free" over those people only', () => {
    // "2 free" must never include somebody who cannot do the thing that was picked.
    expect(code).toMatch(/const branchChairs = chairs\.filter\(\(c\) => ableProviders\.some\(\(p\) => p\.id === c\.schedulableId\)\)/);
  });

  it('tells staff-here-but-none-able apart from nobody-at-all', () => {
    expect(code).toMatch(/const noOneCanDoIt = skilled !== null && branchProviders\.length > 0 && ableProviders\.length === 0/);
    // GRW-456's own condition is untouched, so its sentence still owns the empty-branch case.
    expect(code).toMatch(/const noStaffHere = providers !== null && branchProviders\.length === 0/);
  });

  it('does not offer "Whoever is free" when nobody can be', () => {
    expect(code).toMatch(/const offersWhoever = !forPayment && !paysToken && !noStaffHere && !noOneCanDoIt;/);
  });

  it('says so, naming the service, where the stylist is chosen', () => {
    expect(code).toMatch(/\{noOneCanDoIt \? \(/);
    expect(code).toMatch(/nv\.noOneDoes\(picked\[0\]\?\.name \?\? '', providerNoun\.toLowerCase\(\)\)/);
  });

  it('lets the queue lead and turns "Start now" off', () => {
    expect(code).toMatch(/const noChairFree = freeCount === 0 \|\| noStaffHere \|\| noOneCanDoIt/);
    expect(code).toMatch(/\(!later && !forPayment && \(noStaffHere \|\| noOneCanDoIt\)\)/);
  });

  it('drops a stylist the service changed out from under', () => {
    const effect = code.slice(code.indexOf('if (!schedulableId || skilled === null) return'));
    expect(effect.slice(0, 200)).toMatch(/if \(!skilled\.has\(schedulableId\)\) setSchedulableId\(null\)/);
  });
});

describe('the words for it', () => {
  for (const [lang, m] of [['en', en], ['hi', hi]] as const) {
    it(`${lang} names the service and the noun`, () => {
      const nv = (m as { newVisit: Record<string, string> }).newVisit;
      expect(nv.noOneDoes, `${lang}.newVisit.noOneDoes`).toBeTruthy();
      expect(nv.noOneDoes).toContain('{service}');
      expect(nv.noOneDoes).toContain('{provider}');
      expect(nv.whoDoesWhat, `${lang}.newVisit.whoDoesWhat`).toBeTruthy();
    });
  }
});
