import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-412 — the device specs find their controls in any language, inside the right dialog.
 *
 * `npm run test:devices` needs a browser and a running stack, so it does not run in `npm test`. These pin the three
 * locator decisions that made it go red on develop for reasons that were not a broken screen.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
/** A spec's code, without its comments: a comment explaining an old locator is not the locator. */
const specs = (name: string) =>
  read(`../../../../test/devices/${name}`)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the device specs', () => {
  it('find the account button by a test id that does not change with the language', () => {
    expect(read('AccountMenu.tsx')).toMatch(/data-testid="account-menu"/);
    const lang = specs('language-persists.spec.ts');
    expect(lang).toMatch(/const accountButton = \(page: Page\) => page\.getByTestId\('account-menu'\)\.first\(\);/);
    // The English label is translated (Jira GRW-360): no spec may look for it.
    for (const f of ['language-persists.spec.ts', 'responsive.spec.ts', 'walk-in-sheet.spec.ts', 'move-booking-sheet.spec.ts', 'auth.setup.ts']) {
      expect(specs(f), f).not.toMatch(/name: 'Menu and account'/);
    }
  });

  it('fill the Add-business form inside its dialog, never the page behind it', () => {
    const journey = specs('two-branch-journey.spec.ts');
    expect(journey).toMatch(/const form = page\.getByRole\('dialog', \{ name: 'Add a business' \}\);/);
    expect(journey).toMatch(/const typeSelect = form\.locator\('select'\)/);
    expect(journey).not.toMatch(/const typeSelect = page\.locator\('select'\)/);
  });

  it('follow the screens as they are now: the header branch picker, the walk-in page, the branch before the service', () => {
    const journey = specs('two-branch-journey.spec.ts');
    // Jira GRW-395 — Reports has no menu of its own any more.
    expect(journey).not.toMatch(/menuitemradio/);
    expect(journey).toMatch(/const picker = page\.locator\('\.hbp-pill'\);/);
    // Jira GRW-297 — the walk-in is a page, not a sheet.
    expect(journey).not.toMatch(/\.walk-in-sheet/);
    expect(journey).toMatch(/page\.locator\('\.walk-in-page'\)/);
    // Jira GRW-379 — the branch is picked before the service, whose menu it decides.
    const g3 = journey.slice(journey.indexOf("getByRole('radiogroup', { name: 'Which branch?' })"));
    expect(g3.indexOf("getByRole('radio', { name: 'Indiranagar' })")).toBeLessThan(g3.lastIndexOf('.wi-service-results .wi-row'));
  });

  it('book the move fixture with a service and a client at the staff member’s own branch', () => {
    const setup = specs('auth.setup.ts');
    expect(setup).toMatch(/async function movableBookingCandidates\(/);
    expect(setup).toMatch(/services\.find\(\(s\) => \(detail\?\.serviceIds \?\? \[\]\)\.includes\(s\.id\)\)/);
    expect(setup).not.toMatch(/serviceIds: \[services\[0\]\.id\]/);
    expect(setup).not.toMatch(/schedulableId: providers\[0\]\.id/);
  });
});
