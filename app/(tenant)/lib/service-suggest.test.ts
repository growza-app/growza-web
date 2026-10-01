import { describe, expect, it } from 'vitest';
import {
  extraSuggestions,
  MAX_SUGGESTIONS,
  MIN_SCORE_RESCUE,
  MIN_SCORE_WITH_MATCHES,
  normaliseTerm,
  shouldAskServer,
  SUGGEST_MIN_CHARS,
  usefulHits,
} from './service-suggest';

/**
 * Jira GRW-375 — what the walk-in sheet shows once the server answers.
 *
 * The rules here exist because the first run of this feature appended every
 * neighbour the vector search returned: typing "facial" listed the three
 * Facials and then Beard Styling, Head Shave and Bleach.
 */
interface S {
  id: string;
  name: string;
}
const svc = (id: string, name: string): S => ({ id, name });
const MANICURE = svc('s1', 'Manicure');
const PEDICURE = svc('s2', 'Pedicure');
const NAIL_ART = svc('s3', 'Nail Art');
const BLEACH = svc('s4', 'Bleach');
const ALL = [MANICURE, PEDICURE, NAIL_ART, BLEACH];
const byId = (id: string) => ALL.find((s) => s.id === id);
const names = (items: S[]) => items.map((s) => s.name);
const hit = (serviceId: string, score: number) => ({ serviceId, score });

describe('when the server is asked at all', () => {
  it(`waits for ${SUGGEST_MIN_CHARS} characters`, () => {
    expect(shouldAskServer('cut')).toBe(false);
    expect(shouldAskServer('cutt')).toBe(true);
  });

  it('compares trimmed, lower-cased text', () => {
    expect(normaliseTerm('  Facial ')).toBe('facial');
  });
});

describe('which hits are worth showing', () => {
  it('drops anything below the floor', () => {
    expect(usefulHits([hit('s1', 0.81), hit('s4', MIN_SCORE_RESCUE - 0.01)], false)).toEqual([hit('s1', 0.81)]);
  });

  it('asks for more when the browser already found something', () => {
    const middling = [hit('s1', MIN_SCORE_WITH_MATCHES - 0.05)];
    expect(usefulHits(middling, false)).toHaveLength(1); // empty list: a rescue
    expect(usefulHits(middling, true)).toEqual([]); // list already has rows: not good enough
  });

  it('drops hits far worse than the best one', () => {
    const kept = usefulHits([hit('s1', 0.9), hit('s2', 0.8), hit('s4', 0.62)], false);
    expect(kept.map((h) => h.serviceId)).toEqual(['s1', 's2']);
  });

  it('returns nothing when even the best hit is weak — nonsense stays unanswered', () => {
    expect(usefulHits([hit('s1', 0.4), hit('s2', 0.39)], false)).toEqual([]);
  });

  it(`never more than ${MAX_SUGGESTIONS}`, () => {
    const many = Array.from({ length: 12 }, (_, i) => hit(`m${i}`, 0.9));
    expect(usefulHits(many, false)).toHaveLength(MAX_SUGGESTIONS);
  });

  it("uses the server's floors when it sends them — another model scores on another scale (GRW-389)", () => {
    const lowScale = [hit('s1', 0.42), hit('s2', 0.38)];
    expect(usefulHits(lowScale, false)).toEqual([]); // all-minilm's bar: nothing
    expect(usefulHits(lowScale, false, { rescue: 0.35, withMatches: 0.5 })).toEqual(lowScale);
    expect(usefulHits(lowScale, true, { rescue: 0.35, withMatches: 0.5 })).toEqual([]);
  });
});

describe('the extras shown beside the typed matches', () => {
  it('with no reply there are none', () => {
    expect(names(extraSuggestions([NAIL_ART], null, 'nail art', byId))).toEqual([]);
  });

  it('a reply for an older term is ignored', () => {
    const stale = { term: 'nail', hits: [hit('s1', 0.9)] };
    expect(names(extraSuggestions([NAIL_ART], stale, 'nails', byId))).toEqual([]);
  });

  it('rescues a term the browser could not match: "nails" brings Manicure and Pedicure', () => {
    const remote = { term: 'nails', hits: [hit('s1', 0.81), hit('s2', 0.76)] };
    expect(names(extraSuggestions([], remote, 'nails', byId))).toEqual(['Manicure', 'Pedicure']);
  });

  it('never repeats what the browser already matched — the typed list is left exactly as it was', () => {
    const remote = { term: 'nails', hits: [hit('s3', 0.9), hit('s1', 0.85)] };
    expect(names(extraSuggestions([NAIL_ART], remote, 'nails', byId))).toEqual(['Manicure']);
  });

  it('adds nothing when the reply is all weak neighbours — "facial" stays three Facials', () => {
    const remote = { term: 'facial', hits: [hit('s4', 0.46)] };
    expect(extraSuggestions([NAIL_ART], remote, 'facial', byId)).toEqual([]);
  });

  it('a middling neighbour is a rescue for an empty list, and noise beside a full one', () => {
    const remote = { term: 'tired shoulders', hits: [hit('s1', 0.54)] };
    expect(names(extraSuggestions([], remote, 'tired shoulders', byId))).toEqual(['Manicure']);
    expect(extraSuggestions([NAIL_ART], remote, 'tired shoulders', byId)).toEqual([]);
  });

  it('"haircat" does not grow a Hair Spa beside a correct Haircut (QA: 0.651)', () => {
    const remote = { term: 'haircat', hits: [hit('s4', 0.651)] };
    expect(extraSuggestions([NAIL_ART], remote, 'haircat', byId)).toEqual([]);
  });

  it('an id the sheet does not hold is skipped, never a blank chip', () => {
    const remote = { term: 'nails', hits: [hit('gone', 0.9), hit('s1', 0.88)] };
    expect(names(extraSuggestions([], remote, 'nails', byId))).toEqual(['Manicure']);
  });
});
