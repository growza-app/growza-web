import { describe, expect, it } from 'vitest';
import { exportBody } from '../components/BusinessesToolbar';
import { MAX_SAVED, parseSaved, withoutSaved, withSaved, type SavedFilter } from './saved-filters';

/** Jira GRW-702 — saved Businesses views, and what an export asks for. */
const view = (name: string, status = 'active'): SavedFilter => ({ name, vertical: 'Salon', status, search: '' });

describe('saved views', () => {
  it('AC-01 — a saved view keeps its filters and comes first', () => {
    const list = withSaved([view('Suspended salons', 'suspended')], view('Live salons'));
    expect(list.map((f) => f.name)).toEqual(['Live salons', 'Suspended salons']);
    expect(list[0]).toEqual({ name: 'Live salons', vertical: 'Salon', status: 'active', search: '' });
  });

  it('saving under a name already used replaces it, ignoring case', () => {
    const list = withSaved([view('Live salons', 'suspended')], view('live salons'));
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe('active');
  });

  it('a blank name saves nothing; × removes; at most 8 are kept', () => {
    expect(withSaved([], view('   '))).toEqual([]);
    expect(withoutSaved([view('A'), view('B')], 'A').map((f) => f.name)).toEqual(['B']);
    let list: SavedFilter[] = [];
    for (let i = 0; i < 12; i += 1) list = withSaved(list, view(`View ${i}`));
    expect(list).toHaveLength(MAX_SAVED);
  });

  it('broken or hand-edited storage reads as no saved views', () => {
    expect(parseSaved('not json')).toEqual([]);
    expect(parseSaved('{"name":"x"}')).toEqual([]);
    expect(parseSaved('[{"name":"x"}]')).toEqual([]);
    expect(parseSaved(null)).toEqual([]);
  });
});

describe('export asks for exactly the filters that are set', () => {
  it('All means no filter, and a 1-letter search is not sent', () => {
    expect(exportBody({ vertical: 'All', status: 'All', search: 'g' })).toEqual({});
    expect(exportBody({ vertical: 'Salon', status: 'active', search: ' glow ' })).toEqual({ vertical: 'Salon', status: 'active', search: 'glow' });
  });
});
