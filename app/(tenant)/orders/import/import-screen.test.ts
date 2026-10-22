import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-619 — the import screen, pinned at the source.
 *
 * What was checked in a browser at 344px (choose, upload, the summary, the same file again) is in the PR. These keep the rules that
 * must not drift: the marketplace is chosen and never guessed, the server decides what a file is, the answer is plain counts, and
 * a second upload is safe and says so.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const client = here('./ImportClient.tsx');
const page = here('./page.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-import.css'), 'utf8');
const list = readFileSync(path.resolve(import.meta.dirname, '../OrdersScreen.tsx'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).orders.import as Record<string, string>;

describe('the marketplace is chosen, never guessed from the file', () => {
  it('nothing can be imported until one is chosen, and the button says so', () => {
    expect(client).toContain('const [channel, setChannel] = useState<Channel | null>(null)');
    expect(client).toContain('const ready = channel !== null &&');
    expect(client).toContain("t('chooseFirstButton')");
  });

  it('sends the chosen marketplace with the file, and does not read the file itself', () => {
    expect(client).toContain('api.importOrdersFile(channel, file, request.current.id)');
    expect(client).not.toMatch(/FileReader|\.text\(\)|XLSX|split\(['"]\\n/);
  });
});

describe('a second upload is safe, and the screen says what happened', () => {
  it('one request id per choice, held while it is out, so a double tap or a retry is the same upload', () => {
    expect(client).toContain('if (!channel || inFlight.current) return;');
    expect(client).toContain('request.current?.signature !== signature');
    expect(client).toContain('disabled={!ready}');
  });

  it('says "already in Growza" and, for a replayed answer, that nothing was added again', () => {
    expect(client).toContain("t('alreadyThere')");
    expect(client).toContain("t('replayed')");
    expect(messages('en').alreadyThere).toBe('already in Growza');
  });
});

describe('the answer is plain counts, and what needs the owner is named', () => {
  it('three numbers, the units the shelf could not cover, the codes holding orders back (with the way to fix them) and the unreadable rows by row', () => {
    for (const k of ['summary.created', 'summary.alreadyThere', 'summary.held', 'summary.shortUnits', 'summary.heldCodes', 'summary.problems']) expect(client).toContain(k);
    expect(client).toContain('href="/orders/held"');
    expect(client).toContain("t('row', { row: p.row })");
  });

  it('a server fault shows no words of its own; a refusal shows the server’s own sentence', () => {
    expect(client).toContain("e instanceof ApiError && e.status < 500 ? e.message : t('failed')");
  });

  it('shows a progress line while it works, and no table: the summary is a list that cannot scroll sideways', () => {
    expect(client).toContain("t('working')");
    expect(client).not.toMatch(/<table/);
  });
});

describe('a retry, and a plain http box', () => {
  it('makes its request id with the one helper that works without a secure context, never crypto.randomUUID directly', () => {
    expect(client).toContain("`import-${newRequestId()}`");
    expect(client).not.toContain('crypto.randomUUID');
    expect(here('../[id]/SwapSizeSheet.tsx')).not.toContain('crypto.randomUUID');
  });

  it('says when there are more held codes than it lists, as it does for rows', () => {
    expect(client).toContain("t('moreCodes'");
  });
});

describe('who sees it', () => {
  it('is the owner’s and the manager’s, as the API is: the page bounces the desk to the list, and the list offers the button only to them', () => {
    expect(page).toContain("role === 'owner' || role === 'manager'");
    expect(page).toContain("redirect('/orders')");
    expect(list).toContain("(role === undefined || role === 'owner' || role === 'manager')");
    expect(list).toContain('href="/orders/import"');
  });
});

describe('UX', () => {
  it('plain words in both languages with the same keys and placeholders; "Flipkart" and "Amazon", never FSN, SKU or ASIN as the main word', () => {
    const en = messages('en');
    const hi = messages('hi');
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    const slots = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(en)) {
      expect(hi[k], k).toBeTruthy();
      expect(slots(hi[k]!), k).toEqual(slots(en[k]!));
    }
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toMatch(/\b(FSN|ASIN|SKU|variant|duplicate)\b/i);
  });

  it('draws with tokens and rem, no animation, thumb-tall controls, and the action in a bar at the bottom', () => {
    expect(css.replace(/font-size:\s*16px/g, '')).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(css).toMatch(/\.imp-go\s*\{[^}]*min-height:\s*3rem/);
    expect(css).toMatch(/\.imp-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/);
  });
});
