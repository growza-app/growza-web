import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-514 — pick or add on ONE screen. "Add someone new" used to be a button to a second step; its
 * Name and Phone fields are now a block under the client list, and the `newClient` step is gone.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const code = strip(readFileSync(resolve(__dirname, 'NewVisitSheet.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/72-walk-in-sheet.css'), 'utf8'));

describe('New booking, first screen', () => {
  it('has no separate add step', () => {
    expect(code).not.toMatch(/newClient/);
    expect(code).not.toMatch(/wi-add-new/);
    expect(css).not.toMatch(/\.wi-add-new/);
  });

  it('shows the add block on the first screen, with the same fields and the same checks', () => {
    const start = code.indexOf("{stage.step === 'client' && (");
    const first = code.slice(start, code.indexOf("(stage.step === 'details' || stage.step === 'saving'", start));
    expect(first.length).toBeGreaterThan(1000);
    expect(first).toMatch(/className="wi-new-person"/);
    expect(first).toMatch(/id="wi-name"/);
    expect(first).toMatch(/id="wi-phone"/);
    expect(first).toMatch(/checkPhone\(newPhone, \{ required: later \}\)/);
    expect(first).toMatch(/setNameError\(true\)/);
    expect(first).toMatch(/step: 'details',\s*client: \{ kind: 'new', name: newName\.trim\(\), phone: toStoredPhone\(newPhone\) \?\? '' \}/);
  });

  it('the search seeds the block, but never over what the desk typed', () => {
    expect(code).toMatch(/if \(digitsOf\(typed\)\.length >= 7\) \{\s*if \(!phoneEdited\.current\) setNewPhone\(typed\);/);
    expect(code).toMatch(/else if \(!nameEdited\.current\) \{\s*setNewName\(typed\);/);
    expect(code).toMatch(/nameEdited\.current = true;\s*setNewName\(e\.target\.value\)/);
    expect(code).toMatch(/phoneEdited\.current = true;\s*setNewPhone\(v\)/);
  });

  it('the mode toggle and the title follow the one client step', () => {
    expect(code).toMatch(/const modeStillOpen = !forPayment && stage\.step === 'client';/);
    expect(code).toMatch(/\{!forPayment && stage\.step === 'client' && \(/);
  });
});
