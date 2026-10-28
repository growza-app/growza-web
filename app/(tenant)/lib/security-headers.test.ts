import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-476 · GRW-563 — the header that silently switched phone check-in off.
 *
 * `Permissions-Policy: geolocation=()` is an EMPTY allow-list, which means
 * nobody — this document included. Chrome refuses `getCurrentPosition` before
 * showing a prompt ("Permissions policy violation: Geolocation access has been
 * blocked"), and the dashboard's own code reads that as "the phone could not
 * say". So "Use where I am now" and a stylist's own "I'm in" could never ask
 * for a position on ANY origin, with the phone's own permission granted, and
 * nothing about it was visible on screen: one screen says "your phone must
 * allow location", and the phone had.
 *
 * The header shipped before the feature did, which is why nothing caught it.
 * This test is the catch: the policy is read as text, so the two cannot drift
 * apart again without a failure here.
 */
const config = readFileSync(resolve(__dirname, '../../../next.config.ts'), 'utf8');
const policy = /Permissions-Policy',\s*value:\s*'([^']+)'/.exec(config)?.[1] ?? '';

describe('the Permissions-Policy header', () => {
  it('is sent at all', () => {
    expect(policy, 'no Permissions-Policy in next.config.ts').not.toBe('');
  });

  it('lets THIS page ask for a position — phone check-in is the product', () => {
    expect(policy).toContain('geolocation=(self)');
    // The empty list is the bug: it reads like "locked down" and means "switched off".
    expect(policy).not.toMatch(/geolocation=\(\)/);
  });

  /*
   * The same bug as geolocation's, found on 2026-10-28, seventeen days later, on the other feature that
   * needed a device — and this very test is what held it in place. It asserted the microphone was refused
   * "which nothing here uses", and that parenthesis stopped being true the day voice search shipped
   * (GRW-651). The assertion outlived its own reason and then defended the breakage.
   */
  it('lets THIS page ask for the microphone — voice search is the product', () => {
    expect(policy).toContain('microphone=(self)');
    expect(policy).not.toMatch(/microphone=\(\)/);
  });

  it('still refuses the camera, which nothing here uses', () => {
    expect(policy).toContain('camera=()');
  });

  it('does not open the microphone to embedded third parties', () => {
    expect(policy).not.toContain('microphone=*');
  });

  it('does not open geolocation to embedded third parties', () => {
    // `*` would let any iframe ask in this page's name.
    expect(policy).not.toContain('geolocation=*');
  });
});
