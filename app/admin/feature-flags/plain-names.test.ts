import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jira GRW-697 — a feature switch shows its name and what it does; the code name is under Details on its own page. */
const list = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
const detail = readFileSync(join(__dirname, '[key]/page.tsx'), 'utf8');

describe('feature switches in plain words', () => {
  it('AC-01 — the list shows the label and description, never the key', () => {
    expect(list).toContain('{flag.label}');
    expect(list).toContain('{flag.description}');
    expect(list).not.toMatch(/>\{flag\.key\}</);
  });

  it('AC-03 — the key is on the switch page, inside Details, selectable whole', () => {
    expect(detail).toMatch(/<summary[^>]*>Details<\/summary>/);
    expect(detail).toMatch(/<code style=\{\{ userSelect: 'all'[^}]*\}\}>\{flag\.key\}<\/code>/);
  });
});
