import { describe, expect, it } from 'vitest';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import en from '../messages/en.json';
import { flatten, type Messages } from './messages';
import { inVerticalWords, KEEP_AS_WRITTEN, swapWords } from './vertical-words';

/**
 * 2026-11-07 — the check that stops salon words coming back.
 *
 * The labels are each business type's own, as `docs/architecture/verticals/*.v1.json` in the API repo has them (only the
 * keys the swap reads). If a message is added that says "client" or "stylist" in a way the swap cannot reach, or a
 * salon's own screens change, this fails before a clinic owner sees it.
 */
const LABELS: Record<string, Record<string, string>> = {
  salon: { business: 'Salon', customer: 'Client', customers: 'Clients', provider: 'Stylist', service: 'Service', services: 'Services' },
  spa: { business: 'Spa', customer: 'Guest', customers: 'Guests', provider: 'Therapist', service: 'Treatment', services: 'Treatments' },
  clinic: { business: 'Clinic', customer: 'Patient', customers: 'Patients', provider: 'Doctor', service: 'Consultation', services: 'Consultations' },
  garage: { business: 'Garage', customer: 'Customer', customers: 'Customers', provider: 'Mechanic', service: 'Job', services: 'Jobs' },
  retail: { business: 'Shop', customer: 'Customer', customers: 'Customers', provider: 'Staff member', service: 'Service', services: 'Services' },
  restaurant: { business: 'Restaurant', customer: 'Guest', customers: 'Guests', provider: 'Staff member', service: 'Service', services: 'Services' },
};

/** The arguments a message uses, read with the ICU parser — a swap must never touch one. */
function argumentsOf(text: string): string[] {
  const found = new Set<string>();
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
      if (el.type === TYPE.tag) walk(el.children);
      else {
        found.add(el.value);
        if (el.type === TYPE.plural || el.type === TYPE.select) for (const opt of Object.values(el.options)) walk(opt.value);
      }
    }
  };
  walk(parse(text));
  return [...found].sort();
}

const source = flatten(en as Messages);

describe('a salon reads its messages exactly as written', () => {
  it('changes no message at all', () => {
    const after = flatten(inVerticalWords(en as Messages, LABELS.salon));
    const changed = Object.keys(source).filter((k) => after[k] !== source[k]);
    expect(changed).toEqual([]);
  });
});

describe.each(Object.keys(LABELS).filter((k) => k !== 'salon'))('a %s', (code) => {
  const after = flatten(inVerticalWords(en as Messages, LABELS[code]));

  it('is left with no salon word outside the messages kept as written', () => {
    const left = Object.entries(after)
      .filter(([k]) => !k.startsWith('verticalNouns.') && !KEEP_AS_WRITTEN.has(k))
      .filter(([, v]) => /\b(salons?|stylists?|clients?)\b/i.test(v.replace(/\{[\w]+(,[^{}]*)?\}/g, '')))
      .map(([k, v]) => `${k} = ${v}`);
    expect(left, 'say it with the business\'s own noun, or add the key to KEEP_AS_WRITTEN with the reason').toEqual([]);
  });

  it('keeps every message valid, with the same arguments', () => {
    const broken = Object.keys(source).filter((k) => {
      try {
        return argumentsOf(after[k]!).join() !== argumentsOf(source[k]!).join();
      } catch {
        return true;
      }
    });
    expect(broken).toEqual([]);
  });
});

describe('the swap', () => {
  const clinic = LABELS.clinic!;
  it('keeps the case the message wrote the word in', () => {
    expect(swapWords("Client didn't come", clinic)).toBe("Patient didn't come");
    expect(swapWords('Clients due back', clinic)).toBe('Patients due back');
    expect(swapWords('Find a client or booking', clinic)).toBe('Find a patient or booking');
    expect(swapWords('CLIENTS', clinic)).toBe('PATIENTS');
    expect(swapWords('Same hours as the salon', clinic)).toBe('Same hours as the clinic');
    expect(swapWords('Choose a stylist…', clinic)).toBe('Choose a doctor…');
  });

  it('never touches an argument, but does swap the text inside a plural', () => {
    expect(swapWords('Add “{name}” as a new {client}', clinic)).toBe('Add “{name}” as a new {client}');
    expect(swapWords('{n, plural, one {# client is due back} other {# clients are due back}}', clinic)).toBe(
      '{n, plural, one {# patient is due back} other {# patients are due back}}',
    );
    expect(swapWords('{clients, plural, one {#} other {#}}', clinic)).toBe('{clients, plural, one {#} other {#}}');
  });

  it("keeps a label's own spelling inside a sentence", () => {
    expect(swapWords('Choose a stylist…', { provider: 'MUA' })).toBe('Choose a MUA…');
    expect(swapWords('Pick their services', { services: 'Jobs' })).toBe('Pick their jobs');
  });

  it('leaves a word alone when the business has no label for it', () => {
    expect(swapWords('Same hours as the salon', { customer: 'Patient' })).toBe('Same hours as the salon');
  });

  it('leaves the messages alone when there are no labels (signed out, or the API down)', () => {
    expect(inVerticalWords(en as Messages, null)).toBe(en);
    expect(inVerticalWords(en as Messages, {})).toBe(en);
  });
});
