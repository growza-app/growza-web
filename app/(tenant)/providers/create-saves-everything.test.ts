import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-63 · GRW-171 · GRW-183 · GRW-22 — Add staff must SAVE what it asked for,
 * and in ONE request.
 *
 * ## What this has guarded, in order
 *
 * **GRW-171** — the create branch sent only the profile fields. The hours
 * editor and the "Same as the business" switch sitting directly above the
 * button were collected and silently discarded: a new stylist landed with zero
 * `working_hours` rows, not bookable by the availability engine, zero capacity
 * on Bookings, and no shift for attendance to measure lateness against. A form
 * that asks for something and throws it away is worse than one that never
 * asked.
 *
 * **GRW-183** — the fix for that was a create followed by a PATCH, which meant
 * a stylist who existed unbookable in between. A create that succeeded and a
 * patch that failed left exactly the state the ticket existed to prevent. The
 * hours moved onto the create itself.
 *
 * **GRW-22 (this revision)** — the services did too, and so did an explicit
 * week. `StaffDetailPanel` is gone; the create path is `StaffWizard`, and the
 * whole of it is one `api.createProvider(...)`. The assertions are therefore
 * stronger than before: not "the follow-ups happen in the right order" but
 * "there are no follow-ups".
 *
 * ## Why the source, and not a live create
 *
 * This is a client-side sequencing property over endpoints that already have
 * their own integration tests, and the dev salon sits at its plan's five-seat
 * cap — so creating a provider to watch it is refused by a guard that is
 * working correctly.
 *
 * Comments are stripped first. An assertion that cannot tell code from prose
 * about the code is not asserting about the code — and this file's subject is
 * heavily commented, so without the strip every one of these would pass on the
 * documentation alone.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const source = readFileSync(path.join(repoRoot, 'web/app/(tenant)/providers/StaffWizard.tsx'), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

/** Just the submit handler, so a render-time reference cannot satisfy a save-path assertion. */
const saveBody = (() => {
  const start = source.indexOf('const save = async ()');
  expect(start, 'the submit handler moved or was renamed').toBeGreaterThan(-1);
  const end = source.indexOf('const index = STEPS.findIndex', start);
  expect(end, 'the end of the submit handler moved').toBeGreaterThan(start);
  return source.slice(start, end);
})();

describe('creating a staff member', () => {
  it('sends exactly one request', () => {
    /*
     * The heart of it. Everything else here is a detail of what that one
     * request carries; this is the property that makes a half-made stylist
     * impossible rather than merely unlikely.
     */
    const calls = saveBody.match(/api\.[a-zA-Z]+\(/g) ?? [];
    expect(calls).toEqual(['api.createProvider(']);
  });

  it('carries the week, when the owner set one', () => {
    expect(saveBody).toMatch(/workingHours:/);
  });

  it('carries the skills, when they are not simply all of them', () => {
    expect(saveBody).toMatch(/serviceIds:/);
  });

  it('omits both when they are the defaults, rather than sending a snapshot', () => {
    /*
     * Silence is not laziness here, it is the feature.
     *
     * Sending a COPY of today's salon hours would store rows and leave
     * `uses_org_hours` false, so the stylist would stop following the salon
     * the moment the owner changed it — GRW-183's standing intent, destroyed
     * by a client being helpful. Same for services: omitted means "every active
     * one" of the stylist's branch (Jira GRW-393), resolved server-side at insert.
     */
    expect(saveBody).toMatch(/followsSalon\s*\n?\s*\?\s*\{\}/);
    expect(saveBody).toMatch(/skills\.size === menu\.length \? \{\} :/);
  });

  it('has no follow-up PATCH of any kind', () => {
    expect(saveBody, 'the hours must ride on the create').not.toMatch(/updateProviderWorkingHours/);
    expect(saveBody, 'the skills must ride on the create').not.toMatch(/updateProviderServices/);
    expect(saveBody, 'nothing is patched after the create').not.toMatch(/updateProviderProfile/);
  });

  it('sends the stored phone shape, never the ten typed digits', () => {
    /*
     * GRW-199 — `+91` is chrome, and the field's value is national digits. A
     * create that posted those ten digits raw would store a number no other
     * screen could match, quietly creating a second person for the same phone.
     */
    expect(saveBody).toMatch(/phone: stored/);
    expect(saveBody).toMatch(/toStoredPhone\(phone\)/);
  });
});
