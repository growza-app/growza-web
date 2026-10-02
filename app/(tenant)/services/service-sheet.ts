/**
 * Jira GRW-440 — the arithmetic behind the service sheet's two steppers.
 *
 * Pure, because the parts an owner gets wrong are the edges: tapping − at zero, typing 500 into a field that
 * stops at 480, and the slot length that has to recompute as either stepper moves. None of that is worth
 * discovering in a browser.
 */

/** Duration: five minutes to twelve hours, which is the same window the API's own validation enforces. */
export const DURATION = { min: 5, max: 12 * 60, step: 5 } as const;

/** Cleanup held after a booking. Zero is a real answer — most services need none. */
export const CLEANUP = { min: 0, max: 60, step: 5 } as const;

export interface Bounds {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Hold a number inside its bounds. A value that is not a number at all becomes the minimum, never NaN. */
export function clamp(value: number, bounds: Bounds): number {
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * One tap of − or +.
 *
 * Steps to the next multiple of `step` rather than adding to whatever is there, so a service someone typed as
 * 47 minutes becomes 50 on + and 45 on −, instead of 52 and 42. The owner is nudging it towards a round
 * number, which is what they meant.
 *
 * At an edge it returns the value unchanged, so the button is a no-op rather than silently wrapping.
 */
export function step(value: number, direction: 1 | -1, bounds: Bounds): number {
  const from = clamp(value, bounds);
  const next =
    direction === 1 ? (Math.floor(from / bounds.step) + 1) * bounds.step : (Math.ceil(from / bounds.step) - 1) * bounds.step;
  return clamp(next, bounds);
}

/** Whether a stepper's button does anything from here, so it can be disabled rather than dead. */
export function canStep(value: number, direction: 1 | -1, bounds: Bounds): boolean {
  return step(value, direction, bounds) !== clamp(value, bounds);
}

/**
 * How long the slot is on the calendar: the service plus the cleanup held after it.
 *
 * This is the number the footnote quotes, and it is the one owners are surprised by — a 45-minute service
 * with 10 minutes cleanup takes an hour off the diary, and nothing on this screen used to say so.
 */
export function slotMinutes(durationMin: number, cleanupMin: number): number {
  return clamp(durationMin, DURATION) + clamp(cleanupMin, CLEANUP);
}

/**
 * Whether Save should be live.
 *
 * Disabled until something actually changed, so the owner who opened the sheet to look cannot save a
 * no-op write — and so "Save" means something when it is tappable.
 */
export interface SheetValues {
  name: string;
  categoryId: string;
  durationMin: number;
  cleanupMin: number;
  price: string;
  hasNewPhoto: boolean;
}

export function isDirty(current: SheetValues, original: SheetValues): boolean {
  if (current.hasNewPhoto) return true;
  return (
    current.name.trim() !== original.name.trim() ||
    current.categoryId !== original.categoryId ||
    current.durationMin !== original.durationMin ||
    current.cleanupMin !== original.cleanupMin ||
    current.price.trim() !== original.price.trim()
  );
}
