import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * GRW-61 FR-06 — the guard that stops the next chart widening the page.
 *
 * **This is not a layout test, and cannot be one here.** The vitest
 * environment is `node` and neither jsdom nor happy-dom is installed; even
 * with jsdom it would not help, because jsdom does no layout and every
 * `scrollWidth` it reports is zero. Asserting on measurements it cannot take
 * would be a test that passes for the wrong reason, which is worse than an
 * honest gap. The measured sweep across the resolution matrix was done in a
 * real browser and written up in `docs/tickets/GRW-028-reports.md`; repeating
 * it needs a browser harness this repo does not yet have.
 *
 * What IS checkable without layout is the contract that makes the layout
 * work: wide content declares a fixed width, and something above it declares
 * `overflow-x: auto`. Reports has exactly two such pairs. If a third arrives
 * without saying where it scrolls, this test fails and the author has to say.
 * That is the regression FR-06 is actually about — not "did it overflow
 * today", but "can a new chart break it silently".
 */

/**
 * Comments are stripped before parsing.
 *
 * Without that, the text between one rule's `}` and the next rule's `{` is
 * the selector as far as a regex is concerned — and this stylesheet explains
 * itself heavily, so nearly every selector arrived with a paragraph glued to
 * the front of it and matched nothing.
 */
const CSS = readFileSync(fileURLToPath(new URL('../globals.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/**
 * Content wider than the narrowest supported phone, and the box that is
 * supposed to contain it.
 *
 * Adding a row here is the deliberate act the test exists to force.
 */
const WIDE_CONTENT: { rule: string; scrollsInside: string; why: string }[] = [
  {
    rule: '.rp-heat',
    scrollsInside: '.rp-heat-scroll',
    why: 'weekday x hour grid — narrower than 420px the cells stop being readable',
  },
  {
    rule: '.rp-table',
    scrollsInside: '.rp-table-scroll',
    why: 'seven-column performance tables',
  },
];

/** Every declaration block whose selector list mentions `selector`. */
function blocksFor(selector: string): string[] {
  const found: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS)) !== null) {
    const selectors = m[1]!.split(',').map((s) => s.trim());
    // Exact match only: `.rp-table` must not be satisfied by `.rp-table th`.
    if (selectors.some((s) => s === selector)) found.push(m[2]!);
  }
  return found;
}

function declares(selector: string, property: string, value?: string): boolean {
  return blocksFor(selector).some((body) => {
    const re = new RegExp(`(?<![\\w-])${property}:\\s*([^;]+)`);
    const hit = re.exec(body);
    return hit ? (value === undefined || hit[1]!.trim().startsWith(value)) : false;
  });
}

/** Fixed widths above this can exceed the narrowest phone in the matrix. */
const NARROWEST_VIEWPORT = 320;

describe('Reports keeps its wide content inside its own scrollers', () => {
  it.each(WIDE_CONTENT)('$rule scrolls inside $scrollsInside', ({ rule, scrollsInside }) => {
    expect(blocksFor(rule), `${rule} has no rule at all`).not.toHaveLength(0);
    expect(
      declares(scrollsInside, 'overflow-x', 'auto'),
      `${rule} is wider than a phone and ${scrollsInside} no longer scrolls it. ` +
        'Restore `overflow-x: auto` there, or the page itself will scroll sideways.',
    ).toBe(true);
  });

  it('has no wide Reports rule that has not said where it scrolls', () => {
    const declared = new Set(WIDE_CONTENT.map((w) => w.rule));
    const offenders: string[] = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(CSS)) !== null) {
      const selectors = m[1]!.split(',').map((s) => s.trim());
      const body = m[2]!;
      // A fixed width is safe when a max-width caps it — that is how the
      // filters drawer is 320px on a laptop and 88% on a phone.
      if (/(?<![\w-])max-width:/.test(body)) continue;
      for (const width of body.matchAll(/(?<![\w-])(?:min-)?width:\s*(\d+)px/g)) {
        if (Number(width[1]) <= NARROWEST_VIEWPORT) continue;
        for (const selector of selectors) {
          if (!selector.startsWith('.rp-') || declared.has(selector)) continue;
          offenders.push(`${selector} { ${width[0]} }`);
        }
      }
    }
    expect(
      offenders,
      'A Reports rule is wider than the narrowest phone in the matrix and is not ' +
        'listed in WIDE_CONTENT. Either cap it with a max-width, or add it there ' +
        'naming the container whose `overflow-x: auto` keeps it off the page body.',
    ).toEqual([]);
  });

  it('fails when a scroller stops scrolling', () => {
    // The guard has to be able to fail, or it is decoration. Same check, run
    // against a copy of the stylesheet with the containment removed.
    const broken = CSS.replace(
      /(\.rp-heat-scroll\s*\{[^{}]*?)overflow-x:\s*auto;/,
      '$1overflow-x: visible;',
    );
    expect(broken, 'the .rp-heat-scroll rule this test relies on has moved').not.toBe(CSS);
    const stillScrolls = /\.rp-heat-scroll\s*\{[^{}]*overflow-x:\s*auto/.test(broken);
    expect(stillScrolls).toBe(false);
  });
});
