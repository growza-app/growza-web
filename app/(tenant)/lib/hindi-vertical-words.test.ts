import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import hi from '../../../messages/hi.json';
import { homeCopy } from './home-copy';
import { isLocalised, pickNoun } from './nouns';
import { nounsIn } from './vertical-nouns';

/**
 * QA 2026-11-14, F17 — a clinic in Hindi: the nav and the page titles said सेवाएँ / स्टाफ़ where English says
 * Consultations / Doctors. The vertical's own word, in Hindi, wherever the labels reach a screen.
 */
const clinic = { services: 'Consultations', providers: 'Doctors', customers: 'Patients', appointments: 'Visits', service: 'Consultation', provider: 'Doctor' };
const salon = { services: 'Services', providers: 'Staff', customers: 'Clients', appointments: 'Bookings' };
const inHindi = (labels: Record<string, string>) => nounsIn(labels, hi.verticalNouns as Record<string, string>);
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe("a vertical's words in Hindi", () => {
  it('pickNoun keeps a word already in Hindi, and falls back to the generic word for one still in English', () => {
    expect(pickNoun('hi', 'परामर्श', 'सेवाएँ')).toBe('परामर्श');
    expect(pickNoun('hi', 'Consultations', 'सेवाएँ')).toBe('सेवाएँ');
    expect(pickNoun('en', 'Consultations', 'Services')).toBe('Consultations');
    expect(isLocalised('')).toBe(false);
    expect(isLocalised('Dr. Mehta का काम')).toBe(false);
  });

  it("the clinic's nav says its own words; a salon's stays as it was", () => {
    const c = homeCopy('hi', inHindi(clinic)).nav;
    expect([c.services, c.staff, c.clients]).toEqual(['परामर्श', 'डॉक्टर', 'मरीज़']);
    const s = homeCopy('hi', inHindi(salon)).nav;
    expect([s.services, s.staff, s.clients]).toEqual(['सेवाएँ', 'स्टाफ़', 'ग्राहक']);
    // English labels (an older caller) still read the generic Hindi word, never English.
    expect(homeCopy('hi', clinic).nav.services).toBe('सेवाएँ');
    expect(homeCopy('en', clinic).nav.services).toBe('Consultations');
  });

  it('the server pages put me.labels through the same dictionary before pickNoun', () => {
    expect(read('../services/page.tsx')).toContain('serviceLabel={(await localLabels(me.labels)).services ?? copy.nav.services}');
    expect(read('../providers/page.tsx')).toContain('const staffWord = (await localLabels(me.labels)).providers ?? copy.nav.staff;');
    expect(read('../customers/page.tsx')).toContain('(await localLabels(me.labels)).customers');
    expect(read('../appointments/page.tsx')).toContain('const labelsHere = await localLabels(me.labels);');
  });
});
