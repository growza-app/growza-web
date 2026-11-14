import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';

/** QA 13 Nov 2026, bug 12 — Home said "came back" in the summary and "Returns" on the card under it. */
describe('a returned order is a return, everywhere on a shop Home', () => {
  it('the summary counts returns', () => {
    const en = homeCopy('en').shop;
    expect(en.cameBack(1)).toBe('1 return');
    expect(en.cameBack(3)).toBe('3 returns');
    expect(en.cameBackLabel).toBe('Returns');
    expect(homeCopy('hi').shop.cameBack(3)).toBe('3 वापसी');
  });
});
