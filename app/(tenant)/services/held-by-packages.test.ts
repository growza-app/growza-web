import { describe, expect, it } from 'vitest';
import { packagesInRefusal } from './held-by-packages';

const pkg = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  title: 'Bridal Complete',
  serviceCount: 3,
  priceMinor: '1500000',
  ...over,
});

describe('reading a 409 that names packages', () => {
  it('returns them when the body is what the route sends', () => {
    const out = packagesInRefusal({ error: 'Facial is inside 2 packages', packages: [pkg(), pkg({ id: 'o2', title: 'Glow Up' })] });
    expect(out?.map((p) => p.title)).toEqual(['Bridal Complete', 'Glow Up']);
  });

  it('a package with no price is still a package — free is a price', () => {
    expect(packagesInRefusal({ packages: [pkg({ priceMinor: null })] })).toHaveLength(1);
  });
});

/*
 * Null, not an empty array, for everything below. The caller has to be able to tell "no packages were named"
 * from "this refusal is about something else", because the second must fall back to the plain sentence rather
 * than open a dialog with nothing in it.
 */
describe('a refusal that is about something else', () => {
  it('no body at all', () => {
    expect(packagesInRefusal(undefined)).toBeNull();
    expect(packagesInRefusal(null)).toBeNull();
  });

  it('a body with no packages key — the slot-just-taken 409, say', () => {
    expect(packagesInRefusal({ error: 'Somebody is waiting for this right now' })).toBeNull();
  });

  it('an empty list', () => {
    expect(packagesInRefusal({ packages: [] })).toBeNull();
  });

  it('a list of things that are not packages', () => {
    expect(packagesInRefusal({ packages: ['Bridal Complete', 42, null] })).toBeNull();
  });

  it('a string body, which is what a proxy error looks like', () => {
    expect(packagesInRefusal('<html>502</html>')).toBeNull();
  });

  it('packages that is not a list', () => {
    expect(packagesInRefusal({ packages: { o1: 'Bridal Complete' } })).toBeNull();
  });
});

describe('a half-formed package in an otherwise good list', () => {
  it('is dropped, and the rest are kept', () => {
    const out = packagesInRefusal({ packages: [pkg(), { id: 'o2' }, pkg({ id: 'o3', title: 'Glow Up' })] });
    expect(out?.map((p) => p.id)).toEqual(['o1', 'o3']);
  });

  it('a list where every entry is half-formed is null, not an empty dialog', () => {
    expect(packagesInRefusal({ packages: [{ id: 'o2' }, { title: 'Glow Up' }] })).toBeNull();
  });

  it('an empty title is half-formed — a row with no name is not worth showing', () => {
    expect(packagesInRefusal({ packages: [pkg({ title: '' })] })).toBeNull();
  });
});
