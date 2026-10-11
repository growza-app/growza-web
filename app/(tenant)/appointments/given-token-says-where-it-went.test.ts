import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-10 — "when assigning a stylist it is directly moving the record to To do and looks like no
 * clue where it's gone."
 *
 * Giving a waiting token to a stylist takes it out of the Waiting strip and writes a booking into To do. The
 * screen said nothing about either half: the person vanished off the top of the page, and the list the desk
 * was looking at (All, or whatever was filtered) might not even contain them. So the list now goes to where
 * they went — To do, scrolled to the row, lit for a moment — instead of leaving them to be looked for.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const list = strip(readFileSync(resolve(__dirname, 'BookingsList.tsx'), 'utf8'));
const give = strip(readFileSync(resolve(__dirname, '../components/home/GiveToStaffSheet.tsx'), 'utf8'));
const css = strip(readFileSync(resolve(__dirname, '../styles/32-customers.css'), 'utf8'));

describe('a token that has been given says where it went', () => {
  it('hands the new booking back, and still just closes for a caller with nowhere to point', () => {
    expect(give).toMatch(/onGiven\?: \(appointmentId: string\) => void;/);
    expect(give).toMatch(/const given = await api\.giveToStaff\(entry\.id, providerId, needsServices \? picked : undefined\);/);
    expect(give).toMatch(/if \(onGiven\) onGiven\(given\.appointmentId\);\s*\n\s*else onClose\(\);/);
  });

  it('clears every filter that could hide the row it is about to point at', () => {
    /*
     * A search for the token's number, one stylist, or "not marked yet" would each leave the desk looking at
     * a list the new booking is not in — which is the same problem again, not a smaller one.
     */
    const handler = list.slice(list.indexOf('onGiven={(appointmentId) => {'));
    const body = handler.slice(0, handler.indexOf('}}'));
    expect(body).toMatch(/setStatusFilter\('confirmed'\)/);
    expect(body).toMatch(/setQuery\(''\)/);
    expect(body).toMatch(/setStaffFilter\('Everyone'\)/);
    expect(body).toMatch(/setUnmarkedOnly\(false\)/);
    expect(body).toMatch(/setJustGiven\(appointmentId\)/);
  });

  it('finds the row by the bookings it holds, and takes the eye and the focus there', () => {
    // A combo is several appointments on one card, so the card lists them all and the id is matched with `~=`.
    expect(list).toMatch(/data-appt=\{b\.appointments\.map\(\(a\) => a\.id\)\.join\(' '\)\}/);
    expect(list).toMatch(/document\.querySelector<HTMLElement>\(`\[data-appt~="\$\{justGiven\}"\]`\)/);
    expect(list).toMatch(/row\.scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/);
    // A scroll alone says nothing to a keyboard or a screen reader.
    expect(list).toMatch(/row\.focus\(\{ preventScroll: true \}\)/);
  });

  it('waits for the refreshed list, and lets the mark go', () => {
    /*
     * `router.refresh()` is what brings the row back, so it is not there when the sheet closes. The effect
     * must therefore re-run when the list arrives — and must NOT be left without a dependency array: a timer
     * re-armed on every render never fires on a screen that re-renders, and the row would stay lit all day.
     */
    expect(list).toMatch(/\}, \[justGiven, appointments\]\);/);
    expect(list).toMatch(/window\.setTimeout\(\(\) => setJustGiven\(null\), 2600\)/);
    expect(list).toMatch(/return \(\) => window\.clearTimeout\(done\);/);
  });

  it('marks the row with a ring that fades, and keeps it clear of the sticky filters', () => {
    const rule = css.slice(css.indexOf('.bk-card-just-given {'));
    const block = rule.slice(0, rule.indexOf('}'));
    // A ring, not a fill: the card's own status colour and staff rail still have to read.
    expect(block).toMatch(/outline: 2px solid var\(--accent-deep\);/);
    expect(block).toMatch(/scroll-margin:/);
    expect(css).toMatch(/@keyframes bk-just-given/);
    // The scroll still happens for someone who has asked for less motion; only the flashing stops.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.bk-card-just-given \{\s*\n\s*animation: none;/);
  });
});
