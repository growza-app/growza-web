import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { queueStateOf } from './pos-helpers';

/**
 * QA 2026-11-14 — two orders handed over on the till: the till read "In queue 0 · Completed today 4", Home's queue
 * card read "2 in queue", both "Preparing". Home treated any order under thirty minutes as waiting and never read
 * the handover the till reads. Both screens now ask one function.
 */
const state = (o: Partial<Parameters<typeof queueStateOf>[0]>) =>
  queueStateOf({ handedOverAt: null, paymentPending: false, override: undefined, elapsedMin: 5, ...o });

describe('one queue rule for the till and Home', () => {
  it('a handover on any device is done at once, even a minute after it was rung up', () => {
    expect(state({ handedOverAt: '2026-11-14T05:30:00.000Z', elapsedMin: 1 })).toBe('completed');
    expect(state({ handedOverAt: '2026-11-14T05:30:00.000Z', override: 'preparing' })).toBe('completed');
  });

  it('with no handover recorded: thirty minutes, then done — the boundary is inclusive', () => {
    expect(state({ elapsedMin: 30 })).toBe('preparing');
    expect(state({ elapsedMin: 31 })).toBe('completed');
  });

  it('an unpaid order waits however old it is, and a local "done" cannot clear it', () => {
    expect(state({ paymentPending: true, elapsedMin: 90 })).toBe('preparing');
    expect(state({ paymentPending: true, override: 'completed' })).toBe('preparing');
  });

  it("this device's own flag decides when the server has no handover", () => {
    expect(state({ override: 'completed', elapsedMin: 2 })).toBe('completed');
    expect(state({ override: `preparing:${Date.now()}`, elapsedMin: 45 })).toBe('preparing');
  });

  it('Home and the till both call it, and Home reads the handover from the order row', () => {
    const home = readFileSync(new URL('../components/home/ShopHome.tsx', import.meta.url), 'utf8');
    const till = readFileSync(new URL('./pos-helpers.ts', import.meta.url), 'utf8');
    expect(home).toContain('queueStateOf({ handedOverAt: o.handedOverAt, paymentPending: o.paymentPending === true, override: ov, elapsedMin })');
    expect(home).not.toMatch(/elapsedMin <= 30/);
    expect(till).toContain('const state = queueStateOf({ handedOverAt, paymentPending, override: rawOverride, elapsedMin });');
  });
});
