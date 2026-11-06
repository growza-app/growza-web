import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-11-06 (SAL-04) — a booking cannot be moved onto a time somebody else has.
 *
 * The API refuses it (409 `slot_taken`). This pins the sheet's half: the clash is named before the tap, the button
 * is off while it stands, and "Move anyway" is gone in both languages. Source-reading, like the other
 * client-component tests here — there is no DOM in this suite.
 */
const sheet = readFileSync(resolve(__dirname, 'MoveBookingSheet.tsx'), 'utf8');
const copy = readFileSync(resolve(__dirname, '../lib/use-copy.ts'), 'utf8');
const api = readFileSync(resolve(__dirname, '../lib/api.ts'), 'utf8');
const dictionary = readFileSync(resolve(__dirname, '../lib/api-messages.ts'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).moveBooking as Record<string, string>;
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8')).moveBooking as Record<string, string>;

describe('the move sheet', () => {
  it('keeps the button off while the chosen time is taken', () => {
    expect(sheet).toMatch(/const taken = clash \?\? refused;/);
    expect(sheet).toMatch(/disabled=\{busy \|\| !chosenStart \|\| !!taken\}/);
  });

  it('names the clash where a screen reader hears it', () => {
    expect(sheet).toMatch(/\{taken && <div className="mv-clash" role="status">\{taken\}<\/div>\}/);
  });

  it('says it under the time field, not behind the button bar at the foot of the sheet', () => {
    // At 344px the sheet's last lines sit under the sticky buttons; the reason for a switched-off button must not.
    const at = sheet.indexOf('className="mv-clash"');
    expect(at).toBeGreaterThan(sheet.indexOf('className="mv-any-hint"'));
    expect(at).toBeLessThan(sheet.indexOf('mv.withWhom('));
  });

  it('has no "Move anyway" left — not on the button, not in the copy, not in either language', () => {
    expect(sheet).not.toMatch(/confirmAnyway/);
    expect(copy).not.toMatch(/confirmAnyway|movedOverlap/);
    for (const messages of [en, hi]) {
      expect(messages).not.toHaveProperty('confirmAnyway');
      expect(messages).not.toHaveProperty('movedOverlap');
    }
  });

  it('shows the server’s own sentence when the server refuses what the sheet could not see', () => {
    // A move into somebody's turnaround time is only known to the server. Its sentence goes under the time field
    // too — the line at the head of the sheet has scrolled under the title by the time a time is typed.
    expect(sheet).toMatch(/if \(e instanceof ApiError && e\.code === 'slot_taken'\) setRefused\(e\.message\);/);
    expect(sheet).toMatch(/else setError\(reasonOr\(e, mv\.failed\)\)/);
    // And it is about one choice: another time or another person clears it.
    expect(sheet).toMatch(/useEffect\(\(\) => setRefused\(null\), \[chosenAt, targetProviderId\]\);/);
    expect(dictionary).toContain("'That time is already taken. Pick another time.': 'वह समय पहले से भरा है। कोई दूसरा समय चुनें।'");
  });

  it('no longer expects an `overlapping` answer from a move', () => {
    const call = api.slice(api.indexOf('rescheduleAppointment:'), api.indexOf('/reschedule`, args)'));
    expect(call).not.toMatch(/overlapping/);
  });
});

describe('the words', () => {
  it('say what to do next, in both languages', () => {
    expect(en.clash).toBe('{who} already has someone at that time. Pick another time.');
    expect(en.clashUnknown).toBe('That time is already taken. Pick another time.');
    expect(hi.clash).toContain('{who}');
    expect(hi.clash).toContain('कोई दूसरा समय चुनें');
    expect(hi.clashUnknown).toContain('कोई दूसरा समय चुनें');
  });

  it('no longer promise that a taken time can be typed in', () => {
    expect(en.anotherTimeHint).not.toMatch(/already taken/);
    expect(hi.anotherTimeHint).not.toMatch(/भरा हुआ भी/);
  });
});
