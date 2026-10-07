import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-530 — no helper text under Phone number on New booking. Walk-in ("Leave it blank…") and booking for
 * later ("Needed so we can send them a reminder.") are both gone; the label still says required when it is.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sheet = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));

describe('New booking has no helper text under Phone number', () => {
  // The new person's Phone number field — not the returning client's "Add phone number" one above it.
  const start = sheet.search(/<PhoneField\s+id="wi-phone"/);
  const block = sheet.slice(start, sheet.indexOf('/>', start));

  it('passes no hint', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).not.toMatch(/hint=/);
  });

  it('still marks it required for a booking for later, and still shows its error', () => {
    expect(block).toMatch(/required=\{later\}/);
    expect(block).toMatch(/error=\{phoneError\}/);
  });

  it('the later-only hint copy is gone', () => {
    for (const l of ['en', 'hi']) {
      expect(readFileSync(resolve(__dirname, `../../../messages/${l}.json`), 'utf8')).not.toContain('phoneWhyLater');
    }
  });
});
