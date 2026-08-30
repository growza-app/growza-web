/**
 * Which way a series is actually going (GRW-60 follow-up).
 *
 * The Bookings chart is headed "Is work going up or down?" and answered it
 * with a raw wiggly line. A line that zigzags between 4 and 18 a day does not
 * tell an owner the direction — reading one out of it is a skill, and this
 * product's owner may not have it. So the direction is computed and said in
 * words, and drawn as a straight line over the noise.
 *
 * A least-squares fit, not first-point-versus-last: a quiet Sunday at one end
 * of the range would otherwise decide the verdict on its own.
 */

export interface Trend {
  /** Fitted value at each bucket, for drawing the straight line. */
  line: number[];
  /** Fitted start and end, which is what the sentence quotes. */
  from: number;
  to: number;
  /** Change across the whole stretch, as a percentage of the fitted start. */
  changePct: number | null;
  direction: 'up' | 'down' | 'flat';
}

/**
 * Below this, a slope is noise rather than news.
 *
 * Ten per cent across a whole period is roughly one booking in ten — small
 * enough that calling it a rise would have an owner acting on the weather.
 */
export const FLAT_THRESHOLD_PCT = 10;

export function linearTrend(values: number[]): Trend | null {
  const n = values.length;
  // Two points make a line but not a trend: with one gap there is nothing to
  // average out, so the "direction" would just be those two numbers.
  if (n < 3) return null;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i]! - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  const line = values.map((_, i) => intercept + slope * i);
  const from = Math.max(0, line[0]!);
  const to = Math.max(0, line[n - 1]!);

  // A stretch that started at zero has no percentage to be up by. Say the
  // direction, not a number that would be infinite.
  const changePct = from === 0 ? null : Math.round(((to - from) / from) * 100);
  const direction =
    changePct === null
      ? to > 0
        ? 'up'
        : 'flat'
      : Math.abs(changePct) < FLAT_THRESHOLD_PCT
        ? 'flat'
        : changePct > 0
          ? 'up'
          : 'down';

  return { line, from, to, changePct, direction };
}
