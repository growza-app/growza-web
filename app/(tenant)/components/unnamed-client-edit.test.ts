import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-14 (F13) — a client saved with only a number: the API names them by the number (`reports.customers.ts`
 * `c.name?.trim() || c.waPhone`), and Edit copied that into the Name box, so Save stored the number as their name.
 */
const card = readFileSync(new URL('./ClientProfileCard.tsx', import.meta.url), 'utf8');

describe('editing a client with no name', () => {
  it('opens with an empty Name box, not their number', () => {
    expect(card).toContain("setDraftName(profile && profile.name !== profile.phone ? profile.name : '');");
    expect(card).not.toContain("setDraftName(profile?.name ?? '');");
  });

  it('and an empty box still saves as no name', () => {
    expect(card).toContain('name: draftName.trim() || null,');
  });
});
