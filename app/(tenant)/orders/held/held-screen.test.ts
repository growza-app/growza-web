import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-620 — the "waiting for a size" worklist, pinned at the source.
 *
 * What was checked in a browser at 344px (the rows, matching a code to a size, the orders released, a dismissal that needs a reason)
 * is in the PR. These keep the rules that must not drift: the list is grouped and paged on the server, nothing is guessed, the
 * answer to a fix says how many orders became real, and the words are plain and in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./HeldClient.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-held.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).orders.held as Record<string, string>;

describe('a worklist grouped and paged on the server (FR-05)', () => {
  it('asks the server for one page of codes at a time and searches by the start of a code there — no client-side filtering over what it holds', () => {
    expect(client).toContain('api.heldCodes({ channel: channel || undefined, q, page, pageSize: PAGE_SIZE })');
    expect(client).toContain('<Pagination page={page} total={data.total}');
    expect(client).not.toMatch(/\.filter\(\(r\) =>|\.filter\(\(row\) =>/);
  });

  it('a page that emptied under the person (the last row fixed) steps back rather than showing nothing, and the newest answer wins', () => {
    expect(client).toContain('res.rows.length === 0 && res.total > 0 && page > 1');
    expect(client).toContain('if (mine !== seq.current) return;');
  });
});

describe('the fix is the owner’s, never a guess (BR-01)', () => {
  it('matches a code by SEARCHING the shelf by name on the server and tapping the size — it picks nothing from the report’s product name', () => {
    expect(client).toContain('.sizesToMap(row.channel, find.trim())');
    expect(client).toContain('onClick={() => void match(s)}');
    expect(client).not.toMatch(/nameInReport[^;]*(sizesToMap|saveMarketplaceCodes)/);
  });

  it('says how many orders became real orders, that the orders still wait for another code, or that a code was mapped by someone else meanwhile', () => {
    expect(client).toContain("t('releasedNote'");
    expect(client).toContain("t('stillNote'");
    expect(client).toContain("e.code === 'code_taken'");
    expect(client).toContain("t('takenNote'");
  });

  it('a code that is already mapped to a live size offers Release, not a second mapping; one mapped to a retired size says so and repoints deliberately', () => {
    expect(client).toContain("row.reason === 'ready'");
    expect(client).toContain("replace: row.reason === 'retired' ? true : undefined");
    expect(client).toContain("t('retired'");
  });

  it('a dismissal needs a reason: the button stays off until one is written', () => {
    expect(client).toContain("disabled={busy || reason.trim() === ''}");
    expect(client).toContain('api.dismissHeld(row.channel, row.code, reason)');
  });

  it('one action at a time: a double tap does it once', () => {
    expect(client).toContain('if (inFlight.current) return;');
    expect(client).toContain('disabled={busy}');
  });
});

describe('review of GRW-620 — stale fixes, a skeleton that never ends, an honest failure', () => {
  it('a fix reloads the list the person is looking at NOW (through a ref), not the one the tap started on', () => {
    expect(client).toContain('loadNow.current = load;');
    expect(client).toContain('await loadNow.current();');
  });

  it('tapping the chip that is already chosen does nothing — it never blanks the list for a skeleton that no effect will end', () => {
    expect(client).toContain('if (c === channel) return;');
  });

  it('a failed size search says it failed, with a retry — it is not "no size matches"', () => {
    expect(client).toContain('setFindFailed(true)');
    expect(client).toContain("t('findFailed')");
  });

  it('a refusal that names no size (a race, or a code just removed) keeps the server’s own words instead of an empty "matched to"', () => {
    expect(client).toContain("e.code === 'code_taken' && typeof (e.body as { takenBy?: unknown } | undefined)?.takenBy === 'string'");
  });

  it('with a search on, the headline counts the codes that match, not the orders waiting overall; dates are the business’s own day', () => {
    expect(client).toContain("q ? t('headlineSearch'");
    expect(client).toContain('timeZone: timezone');
  });
});

describe('states and who sees it', () => {
  it('has a loading skeleton, a plain "nothing waiting", and an error with a retry', () => {
    expect(client).toContain('held-skeleton');
    expect(client).toContain("t('nothing')");
    expect(client).toContain("t('retry')");
  });

  it('is the owner’s and the manager’s, as the API is', () => {
    expect(page).toContain("role === 'owner' || role === 'manager'");
    expect(page).toContain("redirect('/orders')");
  });
});

describe('UX', () => {
  it('uses the plain words — "Waiting for a size" — in both languages with the same keys and placeholders, never FSN, SKU or "unresolved"', () => {
    const en = messages('en');
    const hi = messages('hi');
    expect(en.title).toBe('Waiting for a size');
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    const slots = (s: string) => [...new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort();
    for (const k of Object.keys(en)) {
      expect(hi[k], k).toBeTruthy();
      expect(slots(hi[k]!), k).toEqual(slots(en[k]!));
    }
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toMatch(/\b(FSN|ASIN|SKU|unresolved|variant)\b/i);
  });

  it('draws with tokens and rem, no animation, thumb-tall actions, nothing that scrolls sideways', () => {
    expect(css.replace(/font-size:\s*16px/g, '')).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(css).toMatch(/\.held-actions \.btn\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(css).toMatch(/\.held-choice\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(client).not.toMatch(/<table/);
  });
});
