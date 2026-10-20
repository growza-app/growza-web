import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-617 — "Swap size", pinned at the source.
 *
 * What was checked in a browser at 344px (the grid, the difference and the confirm bar all reachable, a double tap
 * swapping once) is in the PR. These keep the rules that must not drift: the server owns every number, the swap is
 * keyed, only the same product's other sizes are offered, and the words are plain and in both languages.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const sheet = here('./SwapSizeSheet.tsx');
const client = here('./OrderClient.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-orders.css'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).orders.detail.swap as Record<string, string>;

describe('the server owns every number (BR-02, FR-04)', () => {
  it('asks the server for the difference by quoting the whole swap, and does no price arithmetic of its own', () => {
    expect(sheet).toContain('api.exchangeQuote(order.id');
    expect(sheet).not.toMatch(/priceMinor|paidMinor|newUnitMinor\s*[-*]/);
    // The only subtraction in the sheet is on quantities, never on money.
    expect(sheet).not.toMatch(/\.priceMinor\s*[-*]/);
  });

  it('the confirm carries the difference the person saw, so a price that moved is refused with the new amount and shown again', () => {
    expect(sheet).toContain('expectedDifferenceMinor: difference');
    expect(sheet).toContain("error.code === 'exchange_difference_changed'");
    expect(sheet).toContain("setNotice(t('priceMoved'))");
  });

  it('a difference is settled before the swap can be confirmed: no way chosen, no swap', () => {
    expect(sheet).toContain('const settled = quote !== null && (difference === 0 || MODES.includes(mode))');
    expect(sheet).toContain('...(difference === 0 ? {} : { settlementMode: mode })');
  });
});

describe('BR-04 — a double tap swaps once', () => {
  it('holds the button while the request is out and sends one id for as long as the choice is the same', () => {
    expect(sheet).toContain('if (!chosen || !quote || inFlight.current) return;');
    expect(sheet).toContain('inFlight.current = true');
    expect(sheet).toContain('request.current?.signature !== signature');
    expect(sheet).toContain('idempotencyKey: request.current.id');
    expect(sheet).toContain('disabled={!canConfirm || documentNumber !== null}');
  });

  it('the newest quote wins, so a slow answer for a size already moved off cannot draw over the right one', () => {
    expect(sheet).toContain('const seq = ++quoteSeq.current');
    expect(sheet).toContain('if (seq === quoteSeq.current) setQuote(q)');
  });
});

describe('BR-03 — only another size of the same product', () => {
  it('lists the sizes of THIS line’s product, leaving out the size already on the bill and any retired one', () => {
    expect(sheet).toContain('api.productSizes(line.productId!)');
    expect(sheet).toContain('all.variants.filter((v) => v.active)');
    expect(sheet).toContain('live.filter((v) => v.id !== line.variantId)');
  });

  it('a size with none left is shown and dimmed but cannot be chosen', () => {
    expect(sheet).toContain('const out = size.stock <= 0');
    expect(sheet).toContain('disabled={out || busy || blockedByWindow}');
  });

  it('a size that ran out between opening and confirming is said plainly and the grid reloads, the rest of the sheet kept', () => {
    expect(sheet).toContain("error.code === 'size_unavailable'");
    expect(sheet).toContain("setNotice(t('sizeGone'))");
    expect(sheet).toContain('void loadSizes()');
  });
});

describe('FR-06 — the window', () => {
  it('the owner is told they may go on; anyone else is told why not, and cannot choose a size', () => {
    expect(sheet).toContain("t('windowOwner'");
    expect(sheet).toContain("t('windowNo'");
    expect(sheet).toContain('const overrideWindow = windowExpired && isOwner');
    expect(sheet).toContain('...(overrideWindow ? { overrideReturnWindow: true } : {})');
  });

  it('an invoice already handed over is said, and the swap goes ahead only when the person says so', () => {
    expect(sheet).toContain("error.code === 'document_issued'");
    expect(sheet).toContain('confirm(true)');
  });
});

describe('the order screen', () => {
  it('offers the action only where the server says it may, on a line the server says can be swapped', () => {
    expect(client).toContain('const canSwap = writable && order.canSwap');
    expect(client).toContain('canSwap && l.swappable');
    // No role test of its own for the swap itself: the owner check is only the window's.
    expect(client).not.toMatch(/role === 'manager'/);
  });

  it('shows a swapped-out line as swapped, not as returned, and the new line as coming from it', () => {
    expect(client).toContain('l.returnedQty - l.swappedQty');
    expect(client).toContain("t('detail.swap.swapped'");
    expect(client).toContain("t('detail.swap.swappedFrom'");
    expect(client).toContain("h.kind === 'exchange'");
  });

  it('is reached from the line it swaps — one tap — and refreshes the order from the server when it is done', () => {
    expect(client).toContain('setSwapping(l.id)');
    expect(client).toMatch(/onSwapped=\{\(\) => \{\s*setSwapping\(null\);\s*void refresh\(\);/);
  });
});

describe('UX — words, tokens, motion', () => {
  it('uses the plain words: "Swap size", never the trade words', () => {
    const en = messages('en');
    expect(en.action).toBe('Swap size');
    for (const [k, v] of Object.entries(en)) expect(v, k).not.toMatch(/variant|SKU|exchange|RTO/i);
  });

  it('has every string in English and in Hindi, with the same keys and the same placeholders', () => {
    const en = messages('en');
    const hi = messages('hi');
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(en)) {
      expect(hi[k], k).toBeTruthy();
      expect(slots(hi[k]!), k).toEqual(slots(en[k]!));
    }
  });

  it('draws with tokens and rem: no pixel font-size and no animation in its rules, and 44px touch targets on its buttons', () => {
    const rules = css.slice(css.indexOf('Jira GRW-617'));
    expect(rules).not.toMatch(/font-size:\s*\d+px/);
    expect(rules).not.toMatch(/transition|animation|@keyframes/);
    expect(rules).toMatch(/\.swp-confirm\s*\{[^}]*min-height:\s*3rem/);
    expect(rules).toMatch(/\.ord-d-line-swap\s*\{[^}]*min-height:\s*2\.75rem/);
  });

  it('the bar stays at the foot of the sheet above the home indicator', () => {
    expect(css).toMatch(/\.swp-bar\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0/);
    expect(css).toContain('env(safe-area-inset-bottom');
  });

  it('has a loading state that reserves the grid, an empty state, and an error with a retry', () => {
    expect(sheet).toContain('swp-skeleton');
    expect(sheet).toContain("t('noOther')");
    expect(sheet).toContain("t('loadError')");
    expect(sheet).toContain("t('retry')");
  });
});
