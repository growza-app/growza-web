import { describe, expect, it } from 'vitest';
import { BROWSE_LIMIT, resolveServiceSearch, type CatalogSearchHit } from './service-search';
import type { Offer, Service } from './api-types';

/**
 * Jira GRW-367 · GRW-288 — the walk-in sheet's search results, with and
 * without the server's typo-tolerant search.
 */
const svc = (id: string, name: string) => ({ id, name }) as Service;
const combo = (id: string, title: string) => ({ id, title, serviceIds: ['s1'] }) as Offer;

const services = [svc('s1', 'Haircut'), svc('s2', 'Facial'), svc('s3', 'Fruit Facial'), svc('s4', 'Manicure'), svc('s5', 'Pedicure'), svc('s6', 'Hair Spa'), svc('s7', 'Threading')];
const combos = [combo('c1', 'Bridal Glow'), combo('c2', 'Facial Friday')];
const hit = (kind: CatalogSearchHit['kind'], itemId: string): CatalogSearchHit => ({ kind, itemId, score: 1 });
const names = (r: { services: Service[]; combos: Offer[] }) => ({ services: r.services.map((s) => s.name), combos: r.combos.map((o) => o.title) });

describe('resolveServiceSearch', () => {
  it('empty box: the first few services and no combos, exactly as before', () => {
    const r = resolveServiceSearch({ services, combos, term: '  ', remote: null });
    expect(r.services).toHaveLength(BROWSE_LIMIT);
    expect(r.combos).toEqual([]);
  });

  it('no server answer: the old substring filter (AC-02 — search down)', () => {
    expect(names(resolveServiceSearch({ services, combos, term: 'Fac', remote: null }))).toEqual({
      services: ['Facial', 'Fruit Facial'],
      combos: ['Facial Friday'],
    });
  });

  it('"phacial": the server finds what substring cannot, in its order (AC-01)', () => {
    const remote = { term: 'phacial', hits: [hit('service', 's2'), hit('service', 's3'), hit('combo', 'c2')] };
    expect(names(resolveServiceSearch({ services, combos, term: 'Phacial ', remote }))).toEqual({
      services: ['Facial', 'Fruit Facial'],
      combos: ['Facial Friday'],
    });
  });

  it('a reply for an older term is ignored — a slow "fa" never overwrites "facial"', () => {
    const remote = { term: 'fa', hits: [hit('service', 's1')] };
    expect(names(resolveServiceSearch({ services, combos, term: 'facial', remote })).services).toEqual(['Facial', 'Fruit Facial']);
  });

  it('switching search on can only add: substring matches the server missed are appended', () => {
    const remote = { term: 'fac', hits: [hit('service', 's3')] };
    expect(names(resolveServiceSearch({ services, combos, term: 'fac', remote })).services).toEqual(['Fruit Facial', 'Facial']);
  });

  it('an id the sheet does not hold is skipped, never a blank row', () => {
    const remote = { term: 'hair', hits: [hit('service', 'gone'), hit('combo', 'gone-too'), hit('service', 's6')] };
    const r = resolveServiceSearch({ services, combos, term: 'hair', remote });
    expect(names(r)).toEqual({ services: ['Hair Spa', 'Haircut'], combos: [] });
  });

  it('never more than 20 rows', () => {
    const many = Array.from({ length: 30 }, (_, i) => svc(`m${i}`, `Wax ${i}`));
    const remote = { term: 'wax', hits: many.map((s) => hit('service', s.id)) };
    expect(resolveServiceSearch({ services: many, combos: [], term: 'wax', remote }).services).toHaveLength(20);
  });
});
