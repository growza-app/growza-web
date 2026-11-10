import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markJustCreated, takeJustCreated } from './just-created';

/** Jira GRW-671 — "Offer saved. Tell your clients now?" is asked once, by the list the new row belongs to. */
describe('the just-created marker', () => {
  let store: Map<string, string>;
  let events: Event[];

  beforeEach(() => {
    store = new Map();
    events = [];
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
      dispatchEvent: (e: Event) => {
        events.push(e);
        return true;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a package marker is left alone by Offers, and taken once by Packages', () => {
    markJustCreated('pkg-1', 'package');
    expect(takeJustCreated('offer')).toBeNull();
    expect(takeJustCreated('package')).toBe('pkg-1');
    // Taken means gone: a refresh or a Back never asks again.
    expect(takeJustCreated('package')).toBeNull();
  });

  it('the list already on screen hears it as an event carrying its kind', () => {
    markJustCreated('offer-9', 'offer');
    expect((events[0] as CustomEvent<{ id: string; kind: string }>).detail).toEqual({ id: 'offer-9', kind: 'offer' });
  });

  it('storage that refuses, or holds something else, asks nothing and breaks nothing', () => {
    store.set('growza.justCreatedOffer', 'not json');
    expect(takeJustCreated('offer')).toBeNull();
    store.set('growza.justCreatedOffer', 'offer-1');
    expect(takeJustCreated('offer')).toBeNull();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('private window');
        },
        setItem: () => {
          throw new Error('private window');
        },
        removeItem: () => {},
      },
      dispatchEvent: () => true,
    });
    expect(() => markJustCreated('offer-2', 'offer')).not.toThrow();
    expect(takeJustCreated('offer')).toBeNull();
  });
});
