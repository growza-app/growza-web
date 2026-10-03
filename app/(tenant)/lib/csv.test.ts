import { describe, expect, it } from 'vitest';
import { csvCell, csvLines } from './csv';

/** Jira GRW-476 — CSV exports cannot carry a formula into the owner's spreadsheet. */
describe('csvCell', () => {
  it('defuses a cell a spreadsheet would run', () => {
    for (const evil of ['=HYPERLINK("http://x","Click")', '+1+1', '-2+3', '@SUM(A1)', '\t=1']) {
      expect(csvCell(evil).startsWith(`"'`), evil).toBe(true);
    }
  });

  it('leaves numbers, negative amounts included, as numbers', () => {
    expect(csvCell(-500)).toBe('-500');
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell(0)).toBe('0');
  });

  it('quotes commas, quotes and newlines, and writes nothing for empty', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvLines([['Name', 'Spent'], ['Asha', 500]])).toBe('Name,Spent\nAsha,500');
  });
});
