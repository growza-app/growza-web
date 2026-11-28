import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Salon spec 18, 2026-11-28 — two people book the same stylist at the same time; one wins. The winner's screen re-read
 * the free times as its own booking saved, found the time it had just booked taken, and said "2:00 PM is taken.
 * Nearest free is 2:30 PM" until "Booked" replaced it — on the screen that got the booking.
 */
const sheet = readFileSync(new URL('./NewVisitSheet.tsx', import.meta.url), 'utf8');

describe('the free times are not re-read while this screen is saving its own booking', () => {
  it('the slot effect returns before clearing or fetching when the stage is saving', () => {
    const effect = sheet.slice(sheet.indexOf("if (!later || !(pageForm ? onForm : stage.step === 'when') || picked.length === 0) return;"));
    const guard = effect.indexOf("if (stage.step === 'saving') return;");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(effect.indexOf('setSlotUtc(null);'));
    expect(guard).toBeLessThan(effect.indexOf('.availability('));
  });
  it('a refusal (saving → client) still reads the list again: stage.step stays in the effect’s dependencies', () => {
    expect(sheet).toMatch(/\}, \[later, stage\.step, onForm, pageForm, deskForm, day, picked, extras, schedulableId, listBranch, timezone\]\);/);
  });
});
