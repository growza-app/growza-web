import type { SeedCatalogService } from '../lib/api';

/**
 * The pure half of the ready-made catalogue picker (design boards 3a/3b).
 *
 * Split out of `CataloguePicker.tsx` so it can be tested. Everything here is a
 * plain function of its arguments — no React, no fetch, no DOM — which is what
 * makes the round trip in `catalogue-logic.test.ts` possible.
 */

/** Price scaling steps, in percent. The owner shifts the presets to their own rates. */
export const SCALE_STEP = 5;
export const SCALE_MIN = -50;
export const SCALE_MAX = 100;

/** A user-supplied pattern is untrusted input: it can be invalid, and it can be slow. */
export const MAX_PATTERN = 200;

/**
 * A catalogue row as the owner is working on it: the vertical's preset, plus
 * whether they have since typed their own price over it.
 */
export interface WorkingService extends SeedCatalogService {
  /**
   * Set once the owner edits this row's price by hand. A number someone typed is
   * not a preset any more, so "adjust all prices" leaves it alone — otherwise
   * setting Haircut to exactly ₹400 and then nudging +10% silently gives ₹440.
   */
  edited: boolean;
}

export function scaled(priceMinor: number | null, pct: number): number | null {
  if (priceMinor === null) return null;
  return Math.round((priceMinor * (100 + pct)) / 100);
}

/** What this row actually costs right now — the preset shifted, or the owner's own number. */
export function effectivePrice(s: Pick<WorkingService, 'priceMinor' | 'edited'>, pct: number): number | null {
  return s.edited ? s.priceMinor : scaled(s.priceMinor, pct);
}

export const rupees = (minor: number | null) => (minor === null ? '' : String(minor / 100));
export const toMinor = (r: string) => (r.trim() === '' ? null : Math.round(Number(r) * 100));

export interface DerivedCategory {
  name: string;
  count: number;
  sample: string[];
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
}

/**
 * Counts, samples and price ranges, recomputed from the working copy.
 *
 * The server derives these too, but once the owner adds or removes a service the
 * server's numbers are stale — and a summary line that disagrees with the list it
 * summarises is worse than no summary at all.
 */
export function deriveCategories(services: WorkingService[], order: string[], pct: number): DerivedCategory[] {
  const names = [...order, ...services.map((s) => s.category).filter((c): c is string => !!c)];
  const seen = new Set<string>();
  const out: DerivedCategory[] = [];

  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const inCat = services.filter((s) => s.category === name);
    if (inCat.length === 0) continue;
    const prices = inCat.map((s) => effectivePrice(s, pct)).filter((p): p is number => p !== null);
    out.push({
      name,
      count: inCat.length,
      sample: inCat.slice(0, 4).map((s) => s.name),
      minPriceMinor: prices.length ? Math.min(...prices) : null,
      maxPriceMinor: prices.length ? Math.max(...prices) : null,
    });
  }
  return out;
}

/** One row in the category editor, held as strings while it is being typed into. */
export interface EditRow {
  key: string;
  name: string;
  /** Only editable in the flat editor; in a category editor it is that category. */
  category: string;
  minutes: string;
  price: string;
  /**
   * The unscaled preset this row came from. The `price` string above shows the
   * *scaled* figure, so saving it back as the base would let "adjust all prices"
   * scale an already-scaled number.
   */
  basePriceMinor: number | null;
  bufferAfterMin: number;
  alreadyHave: boolean;
  edited: boolean;
}

export function blankRow(id: number, category: string): EditRow {
  return {
    key: `new-${id}`,
    name: '',
    category,
    minutes: '30',
    price: '',
    basePriceMinor: null,
    bufferAfterMin: 0,
    alreadyHave: false,
    edited: true,
  };
}

/** A catalogue service, as a row the owner can type into. */
export function toEditRow(s: WorkingService, key: string, pct: number): EditRow {
  return {
    key,
    name: s.name,
    category: s.category ?? '',
    minutes: String(s.durationMin),
    price: rupees(effectivePrice(s, pct)),
    basePriceMinor: s.priceMinor,
    bufferAfterMin: s.bufferAfterMin,
    alreadyHave: s.alreadyHave,
    edited: s.edited,
  };
}

/**
 * A row back into a catalogue service.
 *
 * `basePriceMinor` — not the displayed price — is what an untouched row saves.
 * Writing the displayed figure back would compound the scale on every trip
 * through the editor: open a category at +10%, press Save without touching
 * anything, and every price in it gains another 10%.
 */
export function fromEditRow(
  r: EditRow,
  category: string,
  alreadyHave: (name: string) => boolean,
): WorkingService {
  return {
    name: r.name.trim(),
    category,
    durationMin: Number(r.minutes),
    bufferAfterMin: r.bufferAfterMin,
    priceMinor: r.edited ? toMinor(r.price) : r.basePriceMinor,
    alreadyHave: alreadyHave(r.name.trim().toLowerCase()),
    edited: r.edited,
  };
}

/** Why this row cannot be saved yet, or null when it is fine. */
export function rowProblem(r: EditRow): string | null {
  if (!r.name.trim()) return 'Needs a name';
  const m = Number(r.minutes);
  if (!r.minutes.trim() || !Number.isFinite(m) || m <= 0) return 'Needs minutes';
  if (r.price.trim() && (!Number.isFinite(Number(r.price)) || Number(r.price) < 0)) return 'Price is not a number';
  return null;
}

export interface Matcher {
  test: (r: EditRow) => boolean;
  error: string | null;
}

/**
 * Build a row filter from what the owner typed.
 *
 * Plain substring by default — someone typing "hair" should not have to know what
 * a metacharacter is. `regex` opts into the real thing, and an invalid pattern
 * reports itself instead of throwing the screen away.
 */
export function buildMatcher(query: string, regex: boolean): Matcher {
  const q = query.trim();
  if (!q) return { test: () => true, error: null };
  if (q.length > MAX_PATTERN) return { test: () => true, error: 'That pattern is too long' };

  if (!regex) {
    const needle = q.toLowerCase();
    return {
      test: (r) => `${r.name} ${r.category}`.toLowerCase().includes(needle),
      error: null,
    };
  }
  try {
    const re = new RegExp(q, 'i');
    // Name and category are tested SEPARATELY, not as one joined string. Joined,
    // an end anchor could never match a name — `Spa$` was run against
    // "Hair Spa Hair" and failed — which makes anchors quietly useless.
    return { test: (r) => re.test(r.name) || re.test(r.category), error: null };
  } catch {
    // Show everything rather than nothing while a pattern is half-typed.
    return { test: () => true, error: 'Not a valid pattern yet' };
  }
}
