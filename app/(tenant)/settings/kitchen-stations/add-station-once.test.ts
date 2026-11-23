import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-736 — fix: QA of the overnight stack (item 10). Settings › Kitchen stations › Add: a double tap gave a false
 * "already used" (the button re-drew as disabled only after the second tap had gone), and a name typed while the save was
 * in flight was wiped when it came back.
 */
const src = readFileSync(resolve(__dirname, 'KitchenStationsSetup.tsx'), 'utf8');

describe('Add sends one request, and keeps what was typed after it', () => {
  it('a ref holds a change in flight, so a second tap does nothing', () => {
    expect(src).toContain('const inFlight = useRef(false);');
    expect(src).toMatch(/const run = async[^\n]*\{\s*if \(inFlight\.current\) return false;\s*inFlight\.current = true;\s*setBusy\(true\);/);
    expect(src).toMatch(/\} finally \{\s*inFlight\.current = false;\s*setBusy\(false\);/);
  });

  it('Add is disabled while saving', () => {
    expect(src).toMatch(/<button type="submit" className="btn" disabled=\{busy \|\| !writable\}>\s*\{t\('add'\)\}/);
  });

  it('only the name that was sent is cleared', () => {
    expect(src).toContain("if (await run('add', () => api.addKitchenStation(location, name))) setNewName((now) => (now.trim() === name ? '' : now));");
    expect(src).not.toContain("api.addKitchenStation(location, name))) setNewName('');");
  });
});
