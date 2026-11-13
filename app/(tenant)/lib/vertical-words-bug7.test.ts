import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { billingCopy } from './billing-copy';

/**
 * QA 13 Nov 2026, bug 7 — a spa, a clinic, a dental practice and a garage read "Same hours as the salon", "your first bill
 * comes when your salon goes live" and "e.g. Haircut". Each line now takes the business's own word from its labels.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const en = JSON.parse(read('../../../messages/en.json'));
const hi = JSON.parse(read('../../../messages/hi.json'));

describe('the business and service words come from the vertical', () => {
  it('no message names a salon or a haircut any more', () => {
    expect(en.staffWizard.sameHours).toBe('Same hours as the {business}');
    expect(en.staffWizard.sameHoursSub).toContain('They follow the {business} automatically');
    expect(en.staffWizard.warnNoDays).toContain('switch the {business} hours back on');
    expect(en.services.form.namePlaceholder).toBe('Name of the {service}');
    expect(hi.staffWizard.sameHours).toBe('{business} के जैसे ही घंटे');
    expect(hi.services.form.namePlaceholder).toBe('{service} का नाम');
    expect(en.nouns.business).toBe('business');
    expect(hi.nouns.business).toBe('बिज़नेस');
  });

  it('billing says the business’s own word in English, the generic one in Hindi', () => {
    expect(billingCopy('en').billingStartsAtGoLive('garage')).toBe('Nothing is charged while you are setting up. Your first bill comes when your garage goes live.');
    expect(billingCopy('hi').billingStartsAtGoLive('garage')).toContain('आपका बिज़नेस लाइव होगा');
    expect(read('../settings/billing/page.tsx')).toContain("businessWord={nounInSentence(me?.labels?.business ?? 'Business')}");
  });

  it('the staff wizard and the service form pass the words in', () => {
    const wizard = read('../providers/StaffWizard.tsx');
    expect(wizard).toContain("const businessWord = pickNoun(locale, nounInSentence(labels.business ?? 'Business'), tn('business'));");
    expect(wizard).toContain("t('sameHours', { business: businessWord })");
    expect(wizard).toContain("t('sameHoursSub', { business: businessWord })");
    const form = read('../services/ServiceForm.tsx');
    expect(form).toContain("const serviceWord = pickNoun(locale, nounInSentence(labels.service ?? 'Service'), tn('service'));");
    expect(form).toContain("placeholder={t('namePlaceholder', { service: serviceWord })}");
  });
});
