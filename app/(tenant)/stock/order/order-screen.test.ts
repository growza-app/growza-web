import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-633 — what to order before the season, pinned at the source.
 *
 * What was checked in a browser at 344px (editing a number, the unsaved state, the total) is in the PR. These keep the rules that must not
 * drift: every number shows the two it came from, nothing is invented where there is nothing to compare, the owner's number is saved and
 * is never silently reverted, the file is the server's, the owner's screen is not the desk's, and the words are in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./OrderClient.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-stock-report.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).products.reorder as Record<string, string>;

describe('the basis is on the row (BR-01), and nothing is invented (BR-03)', () => {
  it('each row says what it sold in the same days last year and what is on the shelf', () => {
    expect(client).toContain("t('basis'");
    expect(client).toContain('r.soldLastYear === null');
  });

  it('where there is nothing to compare the row says so and the field is empty — no number is made up', () => {
    expect(client).toContain("t('noBasis'");
    expect(client).toContain("r.order === null ? '' : String(r.order)");
    expect(client).toContain("t('withoutBasis'");
  });

  it('a size that sold out last year is marked, since its sales understate what was wanted', () => {
    expect(client).toContain('r.soldOutLastYear');
    expect(client).toContain("t('soldOut')");
  });

  it('the suggestion is said to be a suggestion, and the one it replaced stays visible', () => {
    expect(client).toContain("t('model')");
    expect(client).toContain("t('suggestedWas'");
  });
});

describe('the owner’s number is kept, and never silently reverted (BR-02)', () => {
  it('is saved as the field is left, to the server, against the season it was typed for', () => {
    expect(client).toContain('onBlur={(e) => void save(r.id, e.target.value)}');
    expect(client).toContain('api.setReorderOverride({ keyId: id, from: r.from, to: r.to, qty })');
  });

  it('a number that did not save stays in the field with its reason and a retry', () => {
    expect(client).toContain("status: 'failed'");
    expect(client).toContain("t('saveFailed')");
    expect(client).toContain('onClick={() => void save(r.id, edit.text)}');
  });

  it('a number that is not whole is refused on the row and is not sent', () => {
    expect(client).toContain("status: 'invalid'");
    expect(client).toContain("t('wholeNumber')");
  });

  it('typing the suggestion again, or emptying the field, keeps nothing of the owner’s — the suggestion shows', () => {
    expect(client).toContain('typed === null ? null : typed === r.order ? r.override : typed === r.suggested ? null : typed');
  });

  it('leaving a field as it was clears nothing, one save per row is in flight at a time, and a slow save never writes over newer typing', () => {
    expect(client).toContain('if (inFlight.current.has(id))');
    expect(client).toContain('queued.current.set(id, text)');
    expect(client).toContain('clearEdit(id, text)');
    // What goes on the order is worked out from the row as it is when the answer lands, never from the render that started the save.
    expect(client).toContain('delta = (order ?? 0) - (x.order ?? 0);');
  });

  it('the export waits for what is still being saved, and says so when a number could not be', () => {
    expect(client).toContain('await Promise.allSettled([...saves.current]);');
    expect(client).toContain("t('fixBeforeExport')");
  });
});

describe('the file is the server’s, and the lead time is the owner’s', () => {
  it('the export is the server’s own file, made with the same filters', () => {
    expect(client).toContain('api.reorderCsv({ location: branch || undefined, categoryId: liveCategory || undefined })');
    expect(client).toContain('if (exportBusy.current) return;');
  });

  it('lead time and days to cover are set per category, and put back to the usual days with one tap', () => {
    expect(client).toContain('api.setReorderRule({ categoryId: rule.categoryId, leadDays, coverDays })');
    expect(client).toContain('void run(null, null)');
  });

  it('follows the header’s branch picker, and starts the page over in the same render when the branch changes', () => {
    expect(client).toContain('useBranch()');
    expect(client).toContain('const livePage = stale ? 1 : page;');
  });
});

describe('who sees it, and how it is laid out', () => {
  it('the front desk is sent back to Stock, as the API refuses it', () => {
    expect(page).toContain("role === undefined || role === 'owner' || role === 'manager'");
    expect(page).toContain("redirect('/stock')");
  });

  it('the number field is 44px and 16px (iOS does not zoom it), and the bar with the total and Export stays in reach', () => {
    expect(css).toMatch(/\.ro-input\s*\{[^}]*min-height: 2\.75rem[^}]*font-size: 16px/);
    expect(css).toMatch(/\.ro-bar\s*\{[^}]*position: sticky[^}]*bottom: 0/);
  });
});

describe('the words, in both languages', () => {
  it('every word the screen uses exists in English and Hindi', () => {
    const used = new Set([...client.matchAll(/\bt\('([A-Za-z]+)'/g)].map((m) => m[1]!));
    for (const lang of ['en', 'hi'] as const) {
      const have = messages(lang);
      for (const key of used) expect(have[key], `${lang}.${key}`).toBeTruthy();
    }
    expect(Object.keys(messages('hi')).sort()).toEqual(Object.keys(messages('en')).sort());
  });
});
