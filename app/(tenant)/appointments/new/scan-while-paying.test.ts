import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';

/**
 * Owner, 2026-10-23 — a scan taken while the bill is being paid for says so.
 *
 * `useBarcodeScan` is live only on the picking step: on 'how' and 'qr' a scan would put a bottle on a bill whose
 * total is already on screen and being paid against, which is how a till stops adding up. Refusing is right. Doing
 * it SILENTLY was not — silence at a counter reads as the broken scanner that `scanMiss` exists to avoid, so the
 * desk scans again, harder, and then goes looking for the fault in the gun.
 *
 * The same `scanNote` strip the picking screen already uses, with the way out in it. Nothing is drawn until
 * somebody actually scans: a line of standing advice about a thing that is not happening is what people stop
 * reading, and it would sit between the total and the payment tiles on every sale.
 */
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const flow = read('PayFlow.tsx');

describe('a scan while taking payment is answered, not swallowed', () => {
  it('still adds only on the picking step', () => {
    // Unchanged, and the reason the rest of this file exists: 'how' and 'qr' must NOT add.
    expect(flow).toContain("useBarcodeScan(productsOnly && step === 'what'");
  });

  it('listens on the two paying steps, and only to say so', () => {
    expect(flow).toContain("useBarcodeScan(productsOnly && (step === 'how' || step === 'qr'), () => setScanNote(t('desk.scanWhilePaying')));");
    // No `onScans`, no `queueScan`: the code is read and dropped. Nothing may reach the bill from here.
    const listener = flow.slice(flow.indexOf("step === 'how' || step === 'qr'"));
    expect(listener.slice(0, listener.indexOf('\n'))).not.toMatch(/onScans|queueScan|addProduct/);
  });

  it("is drawn on both of those screens, under the total where the eye already is", () => {
    // Two `<p className="pf-how-total">` blocks — the 'how' screen and the 'qr' screen — each followed by the strip.
    const after = flow.split('<p className="pf-how-total">').slice(1);
    expect(after).toHaveLength(2);
    for (const block of after) expect(block.slice(0, 400)).toMatch(/\{scanNote \? \(/);
  });

  it('clears itself, like every other scan note', () => {
    // The existing 5s timer owns it: one state, one way it goes away.
    expect(flow).toContain('const id = window.setTimeout(() => setScanNote(null), 5000);');
  });

  it('says what happened and what to do, in both languages', () => {
    const desk = (m: Record<string, unknown>) => {
      for (const ns of Object.values(m)) {
        if (ns && typeof ns === 'object' && 'desk' in ns) {
          const d = (ns as { desk: Record<string, string> }).desk;
          if (d && typeof d === 'object' && 'scanMiss' in d) return d;
        }
      }
      throw new Error('desk copy not found');
    };
    const line = desk(en as Record<string, unknown>).scanWhilePaying;
    // The state first, then the way out — the desk is holding a bottle and needs to know what to do with it.
    expect(line).toMatch(/Not added/);
    expect(line).toMatch(/Go back/);
    expect(desk(hi as Record<string, unknown>).scanWhilePaying).toBeTruthy();
  });
});
