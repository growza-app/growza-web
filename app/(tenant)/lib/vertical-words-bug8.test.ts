import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setupCopy, setupWords } from './setup-copy';

/**
 * QA 13 Nov 2026, bug 8 — the setup checklist, the "not open yet" page, the GST hint and the check-in hint named a salon's
 * clients, a member of staff, a service and a shop door at a spa, a clinic, a dental practice and a garage.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const en = JSON.parse(read('../../../messages/en.json'));
const hi = JSON.parse(read('../../../messages/hi.json'));
const clinic = { provider: 'Doctor', appointments: 'Visits', customers: 'Patients', service: 'Consultation', business: 'Clinic' };
const salon = { provider: 'Stylist', appointments: 'Bookings', customers: 'Clients', service: 'Service', business: 'Salon' };

describe('setup lines say the business’s own words', () => {
  it('a clinic is told to add a doctor and a consultation, and what opens at go-live', () => {
    const c = setupCopy('en', setupWords(clinic));
    expect(c.services).toBe('Add at least one consultation');
    expect(c.providers).toBe('Add a doctor');
    expect(c.closed.body).toMatch(/^Visits, patients, offers, reports and attendance open/);
    expect(c.staffHome).toContain('Visits, patients and your day');
  });

  it('a salon reads its own words; no labels read as these lines always did', () => {
    const s = setupCopy('en', setupWords(salon));
    expect(s.closed.body).toMatch(/^Bookings, clients, offers/);
    expect(s.providers).toBe('Add a stylist');
    const none = setupCopy('en');
    expect(none.services).toBe('Add at least one service');
    expect(none.providers).toBe('Add a member of staff');
  });

  it('takes "an" before a vowel, and Hindi keeps its generic words', () => {
    expect(setupWords({ provider: 'Optometrist' }).aProvider).toBe('an optometrist');
    expect(setupCopy('hi', setupWords(clinic)).providers).toBe('एक स्टाफ सदस्य जोड़ें');
  });

  it('every caller passes the labels in, and the two hints take a noun', () => {
    expect(read('../components/SetupBanner.tsx')).toContain('setupCopy(lang, setupWords(labels))');
    expect(read('../components/home/NotLiveHome.tsx')).toContain('setupCopy(lang, setupWords(labels))');
    expect(read('../not-live-yet/page.tsx')).toContain('setupCopy(await serverLang(), setupWords(labels)).closed');
    expect(en.settingsGst.hint).toContain('your {customers} get a plain receipt');
    expect(en.settingsCheckIn.radiusHint).toBe('0 = the {business} door. 500 = the whole street.');
    expect(read('../settings/gst/GstForm.tsx')).toContain("t('hint', { customers })");
    expect(read('../settings/check-in/CheckInForm.tsx')).toContain("t('radiusHint', { business: businessWord })");
  });
  /** QA 2026-11-14, F18 — the hint said "patients" and the three lines under the status still said "customers". */
  it('every GST line that names the people paying takes the noun, in both languages', () => {
    const lines = [en.settingsGst.statusHelp.unregistered, en.settingsGst.statusHelp.regular, en.settingsGst.statusHelp.composition, en.settingsGst.notRegisteredNote];
    const hiLines = [hi.settingsGst.statusHelp.unregistered, hi.settingsGst.statusHelp.regular, hi.settingsGst.statusHelp.composition, hi.settingsGst.notRegisteredNote];
    for (const l of [...lines, ...hiLines]) expect(l).toContain('{customers}');
    for (const l of lines) expect(l).not.toMatch(/\bcustomers\b(?!\})/);
    for (const l of hiLines) expect(l).not.toContain('ग्राहक');
    const form = read('../settings/gst/GstForm.tsx');
    expect(form).toContain('t(`statusHelp.${status}`, { customers })');
    expect(form).toContain("t('notRegisteredNote', { customers })");
  });
});
