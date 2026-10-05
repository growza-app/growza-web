import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** A booking's sheet in the clay style: the actions as one raised group, each icon in a round badge. */
const here = (p: string) => readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), p), 'utf-8');
const sheet = here('./BookingSheet.tsx');
const css = here('../styles/22-bottom-sheet.css');
const clay = here('../styles/101-clay-app.css');

describe("the booking's sheet", () => {
  it('groups every action in one card', () => {
    expect(sheet).toMatch(/className="sheet bk-sheet"/);
    expect(sheet).toMatch(/<div className="bk-sheet-actions">/);
    // No empty card when a settled booking has no number to dial.
    expect(css).toMatch(/\.bk-sheet-actions:empty \{\s*display: none;/);
  });

  it("takes back what the service form's global .sheet rules change", () => {
    // 98-service-sheet.css sets padding 0, overflow hidden and a grid head on every .sheet.
    expect(css).toMatch(/\.sheet\.bk-sheet \{[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.bk-sheet \.sheet-head \{\s*display: flex;/);
  });

  it('rows are 56px and each icon sits in a tinted round badge', () => {
    expect(css).toMatch(/\.bk-sheet-actions \.sheet-item \{\s*min-height: 56px;/);
    expect(css).toMatch(/\.bk-sheet-actions \.sheet-item svg \{[^}]*border-radius: 50%;/);
    expect(css).toMatch(/\.bk-sheet-actions \.sheet-danger svg \{/);
  });

  it('is raised in clay', () => {
    expect(clay).toMatch(/\.bk-sheet-actions \{\s*box-shadow: var\(--clay-raise\);/);
    expect(clay).toMatch(/\.bk-sheet-actions \.sheet-item:active:not\(:disabled\) \{\s*box-shadow: var\(--clay-press\);/);
  });
});
