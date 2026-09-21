import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';

/**
 * Jira GRW-341 — "Book again" on the details step.
 *
 * Driven in a browser with a stubbed API (the dev tenant has no clients): a returning client with a two-service
 * visit, for later and as a walk-in, no history, cancelled-only history, a removed service, a departed stylist,
 * and a week with no free time. The rules a screenshot would not catch are pinned here; the visit and time
 * arithmetic is in lib/book-again.test.ts.
 */
const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('the Book again card', () => {
  const card = src('BookAgainCard.tsx');
  const sheet = src('NewVisitSheet.tsx');

  it('reads the client\'s own history and uses only what the desk can still sell', () => {
    expect(card).toMatch(/api\s*\.appointments\(WIDE_FROM, WIDE_TO, undefined, clientId\)/);
    expect(card).toMatch(/picked\.some\(\(s\) => !s\)\) return;/); // a removed service: no card
    expect(card).toMatch(/providers\.some\(\(p\) => p\.id === visit\.providerId\)/); // a departed stylist: anyone free
  });

  it('offers the same combo again only when it is still on offer and covers exactly the same services', () => {
    expect(card).toMatch(/o\.title === visit\.offerTitle && sameSet\(o\.serviceIds, visit\.serviceIds\)/);
  });

  it('looks up free times only for "For later", for the same stylist and branch the card names', () => {
    expect(card).toMatch(/if \(!later \|\| !last\) return;/);
    expect(card).toMatch(/api\.availability\(ids, day, last\.plan\.providerId \?\? 'any', branchId\)/);
  });

  it('never claims "no free times" when the lookup itself failed', () => {
    expect(card).toMatch(/times === 'failed' \? nv\.noTimes : nv\.bookAgainNoTimes/);
  });

  it('shows only for an existing client whose list is still empty — a filled-in list is not overwritten', () => {
    expect(sheet).toMatch(/stage\.client\.kind === 'existing' && picked\.length === 0 && extras\.length === 0 && services && providers && offers/);
  });

  it('a time picked on the card survives the time step\'s own slot fetch, and only if it is still free', () => {
    expect(sheet).toMatch(/pendingSlot\.current = time\.utc;\s*setStage\(\{ step: 'when', client \}\);/);
    expect(sheet).toMatch(/r\.sections\.some\(\(sec\) => sec\.slots\.some\(\(sl\) => sl\.utc === wanted\)\)\) setSlotUtc\(wanted\)/);
  });

  it('filling it in never leaves a stale combo or a "no stylist" choice behind', () => {
    const apply = sheet.slice(sheet.indexOf('const applyPlan'), sheet.indexOf('const pendingSlot'));
    expect(apply).toMatch(/setOfferId\(null\)/);
    expect(apply).toMatch(/setComboAmountText\(''\)/);
    expect(apply).toMatch(/setSchedulableId\(plan\.providerId\)/);
    expect(apply).toMatch(/setNoStylist\(false\)/);
  });

  it('is a 44px target, with labels of at least 12px', () => {
    const css = src('../styles/89-book-again.css');
    expect(css).toMatch(/\.wi-again-time\s*\{[^}]*min-height:\s*44px/);
    expect(css).not.toMatch(/font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/);
  });

  it('has its words in the message file', () => {
    expect(en.newVisit.bookAgain).toBe('Book again');
    expect(en.newVisit.bookAgainLastVisit.replace('{day}', '11 Sept')).toBe('Last visit 11 Sept');
    expect(en.newVisit.bookAgainWithStaff.replace('{name}', 'Ravi')).toBe('with Ravi');
  });
});
