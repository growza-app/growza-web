import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-10-25 — the admin portal's word for "the people who do the work" comes from the vertical.
 *
 * Enrolling a restaurant asked how many **stylists** each branch may have, and the branch table on a
 * restaurant's own page counted its staff in stylists. The number behind both is `limits.max_providers`,
 * which has never been a salon word; the label was simply hardcoded from the days when salon was the only
 * vertical.
 *
 * The admin portal is the last place this was still true — the tenant app has read `ctx.labels` since
 * GRW-5 — and it is the one screen where it matters most, because the person using it is enrolling a
 * business of a type they have just chosen from a dropdown.
 *
 * Source-level, like the sibling admin tests: what is being held here is that no salon noun is written into
 * these files at all, which is a property of the source rather than of one render.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(path.join(here, p), 'utf-8');

const branchFields = read('BranchFields.tsx');
const addBusiness = read('AddBusinessModal.tsx');
const businessPage = read('../businesses/[id]/page.tsx');

describe('the enrolment form', () => {
  it('labels the per-branch cap with the chosen vertical’s own plural noun', () => {
    expect(branchFields).toContain("label={`${providersLabel || 'Staff'} at most`}");
    expect(addBusiness).toContain('providersLabel={selectedType?.providersLabel ?? null}');
  });

  it('shows no stylist anywhere a user can read', () => {
    // The field name in the payload stays `stylists` — renaming it is a separate, larger change, and nobody
    // sees it. What must not survive is the WORD, in anything rendered.
    expect(branchFields).not.toMatch(/label="[^"]*[Ss]tylist/);
    expect(branchFields).not.toMatch(/>\s*Stylists?\b/);
  });
});

describe('a business’s own page', () => {
  it('heads the branch table with the same noun', () => {
    expect(businessPage).toContain("{ label: providersLabel || 'Staff', width: '1.4fr' }");
    expect(businessPage).toContain("{providersLabel || 'Staff'} at most");
  });

  it('no longer writes Stylists into the table or the add-branch form', () => {
    expect(businessPage).not.toContain("{ label: 'Stylists'");
    expect(businessPage).not.toMatch(/>\s*Stylists at most\s*</);
  });
});

describe('the fallback', () => {
  it('is the generic word, never the salon one', () => {
    // A vertical whose labels cannot be read says something true about every business rather than something
    // wrong about most of them.
    for (const src of [branchFields, businessPage]) expect(src).toContain("|| 'Staff'");
    expect(branchFields).not.toContain("|| 'Stylists'");
    expect(businessPage).not.toContain("|| 'Stylists'");
  });
});
