import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 13 Nov 2026, bug 6 — a manager was shown "Return items" and refused on Save. The owner decided a manager takes returns
 * (the role that changes Reports, which the desk cannot). The server says who may, as it does for a size swap, so this screen
 * needs nothing from shared: the route's rule (shared 1.0.37) is pinned by growza's route-pages test.
 */
const order = readFileSync(new URL('./OrderClient.tsx', import.meta.url), 'utf8');

describe('Return items is drawn for exactly the people the API accepts', () => {
  it('follows the server’s canReturn, and an older API keeps it the owner’s', () => {
    expect(order).toContain('const canReturn = writable && (order.canReturn ?? isOwner);');
    expect(order).toContain('{returnable && canReturn ? (');
  });
});
