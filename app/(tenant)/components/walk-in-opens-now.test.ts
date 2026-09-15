import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-268 · GRW-273 — the phone's centre button opens on "Walk-in now".
 *
 * It opened a receptionist on now and everybody else — the owner included — on
 * "For later". The person tapping it on a phone mostly has a customer standing
 * there. Read from source: MobileChrome is a client component with no DOM in
 * this test environment, and the line that decides is one expression.
 */
const chrome = readFileSync(resolve(__dirname, 'MobileChrome.tsx'), 'utf8');
const sheet = readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8');

describe('the centre button opens the visit sheet on Walk-in now', () => {
  it('AC-01/AC-02 — for every role that can book, with no role deciding it', () => {
    expect(chrome).toMatch(/\(\) => setSheet\('now'\)/);
    expect(chrome).not.toMatch(/setSheet\([^)]*'later'/);
  });

  it('AC-03 — a stylist still gets no centre action', () => {
    expect(chrome).toMatch(/const mayBook = role !== 'staff';/);
    expect(chrome).toMatch(/const onCentre = mayBook && /);
  });

  it('AC-04 — For later is still one tap away inside the sheet', () => {
    expect(sheet).toMatch(/onClick=\{\(\) => setMode\('later'\)\}/);
    expect(sheet).toMatch(/mode: initialMode = 'now'/);
  });
});
