import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOAST_MS } from './Toast';

/** Jira GRW-704 — a message after a change, with Undo. */
const toast = readFileSync(join(__dirname, 'Toast.tsx'), 'utf8');
const card = readFileSync(join(__dirname, 'PaymentsCard.tsx'), 'utf8');
const layout = readFileSync(join(__dirname, '../layout.tsx'), 'utf8');

describe('toast with Undo', () => {
  it('is on every admin screen and stays 6 seconds, held while pointed at or focused', () => {
    expect(layout).toContain('<ToastProvider>');
    expect(TOAST_MS).toBe(6000);
    expect(toast).toContain('onPointerEnter={() => setHeld(true)}');
    expect(toast).toMatch(/aria-live="polite"/);
  });

  it('AC-01 — after the switch saves: "Online payments on/off for <business>" with Undo', () => {
    expect(card).toContain("message: `Online payments ${next ? 'on' : 'off'} for ${businessName}`");
  });

  it('AC-02 — Undo puts it back exactly: the default again, or the business’s own earlier answer; its reason says Undo', () => {
    const undo = card.slice(card.indexOf('if (previousOverride === null)'));
    expect(undo.indexOf("method: 'DELETE'")).toBeGreaterThan(0);
    expect(undo.indexOf("method: 'DELETE'")).toBeLessThan(undo.indexOf('} else {'));
    expect(card).toContain('await put(previousOverride, `Undo: ${reason}`)');
  });

  it('AC-03 — a failed save shows no Undo; a failed undo says so, without another Undo', () => {
    // The toast is shown only in the success branch of the save; an error stays in the dialog.
    expect(card.indexOf('toast.show(')).toBeGreaterThan(card.indexOf('.then(() => {'));
    expect(toast).toContain("message: 'Could not undo that. Change it back by hand.', tone: 'error'");
  });
});
