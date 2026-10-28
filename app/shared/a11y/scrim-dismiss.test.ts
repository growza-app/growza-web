import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { useScrimDismiss } from './scrim-dismiss';

/**
 * Owner, 2026-10-28: "when he tries to close the overlay by clicking outside of the overlay card, accidently the
 * menu item may add up or gets deleted."
 *
 * The scrim closed on `pointerdown` and unmounted under the finger, so the press that followed was delivered to
 * whatever was now beneath it — a dish tile, which adds one to the bill, or a row's minus, which takes one off.
 */

// `useRef` is the only hook here, so the hook runs fine outside React with a stand-in for it.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, useRef: (initial: unknown) => ({ current: initial }) };
});

const scrim = {} as HTMLElement;
const tileUnderneath = {} as HTMLElement;
const down = (target: unknown, id = 1) => ({ target, currentTarget: scrim, pointerId: id }) as never;
const click = (target: unknown) => ({ target, currentTarget: scrim }) as never;

describe('a tap beside the card', () => {
  it('does NOT close on the way down — that is the whole bug', () => {
    const onClose = vi.fn();
    const h = useScrimDismiss(onClose);
    h.onPointerDown(down(scrim));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on the click, which the scrim is still there to receive', () => {
    const onClose = vi.fn();
    const h = useScrimDismiss(onClose);
    h.onPointerDown(down(scrim));
    h.onClick(click(scrim));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a press that began inside the card and ended out here', () => {
    // A sloppy thumb scrolling a long list. `click` is dispatched to the common ancestor — the scrim — so without
    // this the sheet would close on a drag nobody meant as a dismissal.
    const onClose = vi.fn();
    const h = useScrimDismiss(onClose);
    h.onPointerDown(down(tileUnderneath));
    h.onClick(click(scrim));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores a press that began out here and ended on the card', () => {
    const onClose = vi.fn();
    const h = useScrimDismiss(onClose);
    h.onPointerDown(down(scrim));
    h.onClick(click(tileUnderneath));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('forgets a cancelled press, so the next click is not the old one finishing', () => {
    const onClose = vi.fn();
    const h = useScrimDismiss(onClose);
    h.onPointerDown(down(scrim));
    h.onPointerCancel();
    h.onClick(click(scrim));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes once, not on every click after', () => {
    const onClose = vi.fn();
    const h = useScrimDismiss(onClose);
    h.onPointerDown(down(scrim));
    h.onClick(click(scrim));
    h.onClick(click(scrim));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays shut while the sheet is busy with its own answer', () => {
    const onClose = vi.fn();
    const h = useScrimDismiss(onClose, false);
    h.onPointerDown(down(scrim));
    h.onClick(click(scrim));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('every scrim in the app uses it', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = join(dir, n);
      if (statSync(full).isDirectory()) return n === 'node_modules' ? [] : walk(full);
      return /\.tsx$/.test(full) ? [full] : [];
    });

  it('leaves no copy of the line behind — eleven files carried it', () => {
    const offenders = walk(join(process.cwd(), 'app'))
      .filter((f) => /onPointerDown=\{\(e\) => e\.target === e\.currentTarget/.test(readFileSync(f, 'utf8')))
      .map((f) => f.split('/app/')[1]);
    expect(offenders).toEqual([]);
  });

  it('and every one of them asks the hook', () => {
    // Files that RENDER one. `PosClient` only asks whether one is open (`querySelector`), and has no scrim of its own.
    const scrims = walk(join(process.cwd(), 'app')).filter((f) => /className="pf-keypad-scrim/.test(readFileSync(f, 'utf8')));
    expect(scrims.length).toBeGreaterThanOrEqual(11);
    for (const f of scrims) {
      expect(readFileSync(f, 'utf8'), f.split('/app/')[1]).toContain('useScrimDismiss(');
    }
  });
});
