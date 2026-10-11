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

  it('still refuses the camera and the microphone, which nothing here uses', () => {
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
  });

  it('does not open geolocation to embedded third parties', () => {
    // `*` would let any iframe ask in this page's name.
    expect(policy).not.toContain('geolocation=*');
  });
});
