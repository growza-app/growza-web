import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fromDashboard } from '../lib/dashboard-root';

/**
 * Jira GRW-63 · GRW-195 — a stylist is offered no button that would 403.
 *
 * The API is the boundary and it is closed: `PATCH /appointments/:id/status`
 * and `POST /appointments/:id/checkout` both refuse a staff session. This is
 * about the other half — a control that answers "forbidden" reads as the
 * product being broken rather than as a rule, so the sheet must not draw the
 * three outcome actions for somebody who cannot use them.
 *
 * All three, not two: "Mark as done" opens the checkout flow, and checkout
 * sets `status = 'completed'`, so it is an outcome action wearing a till's
 * clothing.
 *
 * Jira GRW-409 — each button is now gated on the route IT calls, asked of the
 * shared rule (`useMayUse`) inside the sheet, not on a `canSettle` prop every
 * caller had to remember to pass.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const source = readFileSync(fromDashboard('app/(tenant)/components/BookingSheet.tsx'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/** Every `{flag && ( … )}` block in the source, each cut at its matching close paren. */
function gatedBlocks(src: string, flag: string): string[] {
  const marker = `{${flag} && (`;
  const blocks: string[] = [];
  for (let at = src.indexOf(marker); at >= 0; at = src.indexOf(marker, at + 1)) {
    let depth = 0;
    for (let i = at + marker.length - 1; i < src.length; i++) {
      if (src[i] === '(') depth++;
      if (src[i] === ')' && --depth === 0) {
        blocks.push(src.slice(at, i + 1));
        break;
      }
    }
  }
  return blocks;
}

const GATES: Array<[flag: string, action: string, control: string]> = [
  ['mayCheckout', 'booking.checkout', 'onClick={openCheckout}'],
  ['maySetStatus', 'booking.setStatus', "onClick={() => setAsking('no_show')}"],
  ['maySetStatus', 'booking.setStatus', "onClick={() => setAsking('cancelled')}"],
  ['mayMove', 'booking.reschedule', 'onClick={() => setMoving(true)}'],
];

describe('BookingSheet outcome actions', () => {
  for (const [flag, action, control] of GATES) {
    it(`${control} is drawn only when ${action} is usable`, () => {
      expect(source).toContain(`const ${flag} = useMayUse('${action}')`);
      expect(source.split(control).length - 1, `${control} is missing`).toBe(1);
      expect(
        gatedBlocks(source, flag).some((block) => block.includes(control)),
        `${control} is rendered outside {${flag} && (…)}`,
      ).toBe(true);
    });
  }

  it('and every one of them is still only for an unsettled booking', () => {
    const [block] = gatedBlocks(source, '!settled');
    expect(block, 'the {!settled && (…)} block is missing').toBeDefined();
    for (const [, , control] of GATES) expect(block).toContain(control);
  });

  it('keeps no role prop a caller could forget', () => {
    expect(source).not.toMatch(/canSettle/);
  });
});

describe('the Bookings list', () => {
  const list = readFileSync(fromDashboard('app/(tenant)/appointments/BookingsList.tsx'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('passes only the business capability — the role is the sheet’s own question (Jira GRW-409)', () => {
    expect(list).toMatch(/canMove=\{canReschedule\}/);
    expect(list).not.toMatch(/canSettle=/);
  });
});

/**
 * Owner-app audit, 2026-10-10 — Cancel and "Client didn't come" ask first.
 *
 * Both are final (Jira GRW-467), and both acted on one tap: Cancel from the bottom of the sheet under the thumb,
 * didn't-come from the row above Move. The first tap now opens the question; only the second, on Yes, settles the
 * booking — and "Keep the booking" takes the focus, so Enter or a hurried second tap keeps it.
 */
describe('the two final actions ask first', () => {
  it('the first tap only asks', () => {
    expect(source).toMatch(/onClick=\{\(\) => setAsking\('cancelled'\)\}>\s*<IconClose \/>\s*\{bk\.cancel\}/);
    expect(source).toMatch(/onClick=\{\(\) => setAsking\('no_show'\)\}>\s*<IconClose \/>\s*\{bk\.markMissed\}/);
  });

  it('only the Yes inside the question settles the booking', () => {
    const ask = source.slice(source.indexOf('const askFirst ='), source.indexOf('</div>', source.indexOf('const askFirst =')));
    expect(ask).toContain('onClick={() => setStatus(status)}');
    expect(ask).toMatch(/ref=\{keepRef\}[^>]*onClick=\{\(\) => setAsking\(null\)\}/);
    expect(source).toContain("askFirst('cancelled', bk.cancelAsk, bk.cancelYes)");
    expect(source).toContain("askFirst('no_show', bk.noShowAsk, bk.noShowYes)");
  });

  it('Keep the booking takes the focus', () => {
    expect(source).toMatch(/if \(asking\) keepRef\.current\?\.focus\(\)/);
  });

  it('says it in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const sheet = JSON.parse(readFileSync(fromDashboard(`messages/${lang}.json`), 'utf-8')).bookingSheet;
      for (const key of ['cancelAsk', 'cancelYes', 'cancelKeep', 'noShowAsk', 'noShowYes']) expect(sheet[key], `${lang}.${key}`).toBeTruthy();
    }
  });
});
