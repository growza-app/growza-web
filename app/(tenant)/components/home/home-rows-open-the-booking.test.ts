import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Owner, 2026-10-13: "these are not clickable?"
 *
 * Home's "Bookings today" listed a visit — who, what, where it stands — and did nothing when tapped, while the
 * same visit on the Bookings screen opens a receipt. One booking, one way to read it: the row now opens the
 * same `BookingSummary`, from the `BookingGroup` Home already holds.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const parts = readFileSync(path.join(here, 'parts.tsx'), 'utf-8');
const home = readFileSync(path.join(here, 'OwnerHome.tsx'), 'utf-8');
const css = readFileSync(path.join(here, '../../styles/83-role-home.css'), 'utf-8');

describe('a booking row on Home opens that booking', () => {
  it('is a real button, not a div with an onClick', () => {
    // `.hm-row-button` is GiveToStaffSheet's row: a 56px target, reachable from a keyboard, focus ring and all.
    expect(parts).toContain('<li key={g.key} className="hm-row hm-row-button">');
    expect(parts).toMatch(/<button type="button" onClick=\{\(\) => onOpen\(g\)\}>/);
    expect(css).toMatch(/\.hm-row-button button \{[\s\S]{0,260}min-height: 56px;/);
  });

  it('still renders a plain row where nothing opens', () => {
    // `onOpen` is optional: a Home that has nothing to show for a tap must not pretend otherwise.
    expect(parts).toMatch(/onOpen\?: \(group: BookingGroup\) => void;/);
    expect(parts).toMatch(/return onOpen \? \(/);
    expect(parts).toContain('<li key={g.key} className="hm-row">');
  });

  it('opens the same sheet the Bookings screen opens, with no fetch of its own', () => {
    expect(home).toContain("import { BookingSummary } from '../BookingSummary';");
    expect(home).toMatch(/const \[openBooking, setOpenBooking\] = useState<BookingGroup \| null>\(null\);/);
    expect(home).toContain('onOpen={setOpenBooking}');
    expect(home).toMatch(/\{openBooking \? <BookingSummary booking=\{openBooking\} timezone=\{p\.timezone\} onClose=\{\(\) => setOpenBooking\(null\)\} \/> : null\}/);
  });
});
