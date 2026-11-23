import type { MaterialUnit } from './api-types';

/**
 * Jira GRW-737 — a kitchen's quantities. The API keeps every amount as a whole number of THOUSANDTHS of the item's unit (kg → grams,
 * L → millilitres, pcs → a thousandth of a piece), so nothing is ever a float. These turn that into what a cook reads, and what they type
 * back into it.
 */

/** The smaller unit a recipe may be typed in, and how many of it make one of the item's unit. */
export const SMALL_UNIT: Record<MaterialUnit, { unit: 'g' | 'ml' | null; per: number }> = {
  kg: { unit: 'g', per: 1000 },
  l: { unit: 'ml', per: 1000 },
  pcs: { unit: null, per: 1 },
};

/** "9.5", "0.25", "-0.2", "48": up to three decimals, never a trailing zero. */
export function amount(thousandths: number): string {
  const sign = thousandths < 0 ? '-' : '';
  const abs = Math.abs(thousandths);
  const whole = Math.floor(abs / 1000);
  const frac = String(abs % 1000).padStart(3, '0').replace(/0+$/, '');
  return `${sign}${whole}${frac ? `.${frac}` : ''}`;
}

/**
 * QA 2026-11-19, problem 5 — an amount to READ, not to type back: recipes take grams off kilos, so a busy kitchen's list filled with
 * "1.194 kg" and "5.017 L". Two decimals (1.19 kg), three only under a tenth so a pinch of a spice never reads as 0, whole pieces.
 * Fields keep `amount()`: what is typed back must be exact.
 */
export function shownAmount(thousandths: number, unit: MaterialUnit): string {
  const sign = thousandths < 0 ? -1 : 1;
  const abs = Math.abs(thousandths);
  // Halves round away from zero on both sides of it: −1.785 L reads −1.79, as 1.785 reads 1.79.
  if (unit === 'pcs' && abs >= 1000) return amount(sign * Math.round(abs / 1000) * 1000);
  if (abs < 100) return amount(thousandths);
  return amount(sign * Math.round(abs / 10) * 10);
}

/**
 * Text a person typed → thousandths, or null when it is not a quantity. `in` is the unit they typed it in: the item's own (kg) or its
 * small one (g), where 250 g is 250 thousandths of a kg. At most three decimals in the item's unit, and none in grams.
 */
export function parseAmount(text: string, unit: MaterialUnit, typedIn: 'big' | 'small' = 'big', allowZero = false): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (typedIn === 'small') {
    if (frac.length > 0 || !SMALL_UNIT[unit].unit) return null;
    const n = Number(whole);
    return n > 0 || (allowZero && n === 0) ? n : null;
  }
  if (frac.length > 3) return null;
  const n = Number(whole) * 1000 + Number(frac.padEnd(3, '0'));
  if (!Number.isSafeInteger(n)) return null;
  return n > 0 || (allowZero && n === 0) ? n : null;
}

/** A recipe line reads best in grams when it is under a kilo: 250 g, 1.2 kg, 2 pcs. */
export function recipeAmount(thousandths: number, unit: MaterialUnit): { text: string; unit: string } {
  const small = SMALL_UNIT[unit];
  if (small.unit && thousandths < 1000) return { text: String(thousandths), unit: small.unit };
  return { text: amount(thousandths), unit: unit === 'l' ? 'L' : unit };
}

/** The unit as a cook writes it. */
export const unitWord = (unit: MaterialUnit): string => (unit === 'l' ? 'L' : unit);

/**
 * Jira GRW-738 — rupees a person typed ("250", "180.50") → paise, or null when it is not a price. Never below zero, at most two decimals.
 * An empty field is not a price either: the caller decides whether empty means "no price" (BR-01).
 */
export function parseRupees(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** Paise → what goes back in a price field: "250", "180.5". */
export function rupeesText(paise: number): string {
  return String(paise / 100);
}

/** Jira GRW-738 — today in the business's own timezone, as the YYYY-MM-DD a date field takes. */
export function businessToday(timeZone: string | undefined, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Jira GRW-738 — pack size × packs (both thousandths) = the quantity in the item's unit, as the API works it out. */
export const packQty = (packSize: number, packs: number): number => Math.round((packSize * packs) / 1000);
