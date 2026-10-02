import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { totalMinutes, type PickedItem } from './NewVisitSheet';

/**
 * Jira GRW-451 — what the new-booking sheet tells the desk it just did.
 *
 * Four claims, each of which was wrong in a way nobody could see from the screen alone: a service added
 * beside a combo was booked and charged but never named; "Booked" withheld the day and time; the chosen-slot
 * line measured a shorter visit than the one being reserved; and the queue button rendered above the row it
 * is last in. `NewVisitSheet` is a client component with no DOM in this environment — the same reason
 * `walk-in-opens-now.test.ts` and `record-payment-till.test.ts` read source — so the pure helper is called
 * directly and the rest is read.
 */
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');
/** The sheet with its prose taken out — a comment explaining a change quotes the code the change removed. */
const code = sheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8');
const give = readFileSync(resolve(__dirname, 'home/GiveToStaffSheet.tsx'), 'utf8');

const item = (name: string, durationMin: number): PickedItem => ({
  serviceId: `svc-${name}`,
  name,
  durationMin,
  priceMinor: '45000',
});

describe('the duration a visit is booked for', () => {
  it('counts an extra beside the combo', () => {
    const combo = [item('Haircut', 30), item('Colour', 60)];
    const extra = [item('Beard Trim', 20)];
    // The availability query has always asked for `[...picked, ...extras]`; the line under the chosen slot
    // measured `picked` alone and read 90 minutes over a 110-minute reservation.
    expect(totalMinutes([...combo, ...extra])).toBe(110);
    expect(totalMinutes(combo)).toBe(90);
  });

  it('is zero before anything is picked', () => {
    expect(totalMinutes([])).toBe(0);
  });
});

describe('every line that ends a step names everything that was picked', () => {
  it('builds one list from picked and extras', () => {
    expect(sheet).toMatch(/const everything = useMemo\(\(\) => \[\.\.\.picked, \.\.\.extras\], \[picked, extras\]\)/);
    expect(sheet).toMatch(/const everythingNamed = everything\.map\(\(p\) => p\.name\)\.join\(' \+ '\)/);
  });

  it('no summary maps `picked` on its own any more', () => {
    // The queued, recorded, paid and chosen-slot lines. `picked` still drives the PICKED LIST itself, which
    // renders a combo as one row and its extras separately — that is a different job and stays as it is.
    // Comments are stripped first: the ones explaining this change quote the very code it removed.
    expect(code).not.toMatch(/picked\.map\(\(p\) => p\.name\)\.join\(' \+ '\)/);
    expect(code).not.toMatch(/totalMinutes\(picked\)/);
  });
});

describe('a booking says when it is', () => {
  it('the done screen names the day and the time, in the salon’s zone', () => {
    expect(sheet).toMatch(/formatDateWithWeekday\(stage\.result\.startAt, timezone, \{ withYear: false, locale \}\)/);
    expect(sheet).toMatch(/formatTime\(stage\.result\.startAt, timezone\)/);
  });

  it('only for a booking — a walk-in’s answer is "now"', () => {
    const doneSub = sheet.slice(sheet.indexOf("{later ? nv.booked : nv.recorded}"));
    expect(doneSub.slice(0, 1200)).toMatch(/\{later\s*\?\s*`\$\{formatDateWithWeekday/);
  });

  it('follows the reader’s language rather than hard-coding one', () => {
    expect(sheet).toMatch(/const locale = useLocale\(\)/);
  });
});

describe('"Add to waiting queue" is a button, in the order Tab reaches it', () => {
  it('comes after the primary action in the DOM, so the wrap reads top to bottom', () => {
    const actions = sheet.slice(sheet.indexOf('className={`modal-actions wi-actions'));
    const primary = actions.indexOf('nv.markDone : nv.start');
    const queue = actions.indexOf('nv.addToQueue');
    expect(primary).toBeGreaterThan(-1);
    expect(queue).toBeGreaterThan(primary);
  });

  it('no longer moves itself up the screen with `order`', () => {
    // `order: -1` put it first for the eye and second for Tab — two orders for one set of buttons.
    expect(css).not.toMatch(/\.wi-queue-btn\s*\{[^}]*order:\s*-1/);
  });

  it('is bordered once it is alone on a line, so it does not read as a heading', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 860px)'));
    const rule = phone.slice(phone.indexOf('.wi-actions .wi-queue-btn'));
    expect(rule.slice(0, 260)).toMatch(/border:\s*1px solid/);
    expect(rule.slice(0, 260)).toMatch(/flex:\s*1 0 100%/);
  });
});

describe('giving a token at a branch with nothing on its menu', () => {
  it('tells an empty menu apart from still loading', () => {
    expect(give).toMatch(/useState<Service\[\] \| null>\(null\)/);
    expect(give).toMatch(/services === null \? <p className="hm-empty">\{t\.loadingServicesHere\}<\/p>/);
    expect(give).toMatch(/services !== null && services\.length === 0 \? <p className="hm-empty">\{t\.noServicesHere\}<\/p>/);
  });

  it('a failed fetch lands on the sentence, not on a spinner that never stops', () => {
    const katch = give.slice(give.indexOf('.catch(() => {'));
    expect(katch.slice(0, 400)).toMatch(/setServices\(\[\]\)/);
  });
});
