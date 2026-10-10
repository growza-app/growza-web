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
  ['maySetStatus', 'booking.setStatus', "onClick={() => setStatus('no_show')}"],
  ['maySetStatus', 'booking.setStatus', "onClick={() => setStatus('cancelled')}"],
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
 * Owner-app audit, 2026-10-10 — Cancel asks first.
 *
 * A cancelled booking is final (Jira GRW-467), and the button sat at the bottom of the sheet under the thumb, acting
 * on one tap. The first tap now opens the question; only the second, on "Yes, cancel it", cancels — and "Keep the
 * booking" takes the focus, so Enter or a hurried second tap keeps it.
 */
describe('Cancel this booking asks first', () => {
  it('the first tap only asks', () => {
    expect(source).toMatch(/onClick=\{\(\) => setAskingCancel\(true\)\}>\s*<IconClose \/>\s*\{bk\.cancel\}/);
  });

  it('only the Yes button cancels, and it is drawn only while asking', () => {
    const asking = source.slice(source.indexOf('{askingCancel ? ('), source.indexOf(') : ('));
    expect(asking).toContain("onClick={() => setStatus('cancelled')}");
    expect(asking).toContain('{bk.cancelYes}');
    expect(asking).toMatch(/ref=\{keepRef\}[^>]*onClick=\{\(\) => setAskingCancel\(false\)\}/);
  });

  it('Keep the booking takes the focus', () => {
    expect(source).toMatch(/if \(askingCancel\) keepRef\.current\?\.focus\(\)/);
  });

  it('says it in both languages', () => {
    for (const lang of ['en', 'hi']) {
      const sheet = JSON.parse(readFileSync(fromDashboard(`messages/${lang}.json`), 'utf-8')).bookingSheet;
      for (const key of ['cancelAsk', 'cancelYes', 'cancelKeep']) expect(sheet[key], `${lang}.${key}`).toBeTruthy();
    }
  });
});
