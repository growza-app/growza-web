import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

/**
 * Owner, 9 Nov 2026 — "an accidental touch directly opens WhatsApp; it should be under the card, only the number as
 * text". And the list should look like a list: one clean row per person.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const list = read('CustomersClient.tsx');
const card = read('../components/ClientProfileCard.tsx');
const css = read('../styles/32-customers.css');

describe('the Customers list', () => {
  it('has no WhatsApp link on any row, phone or table: the number is text', () => {
    expect(list).not.toContain('wa.me');
    expect(list).not.toContain('IconWhatsApp');
    expect(list).toContain('<span className="cust-phone">{formatPhone(c.waPhone)}</span>');
  });

  it('opens the person on a tap, and WhatsApp is in what opens, beside Call', () => {
    expect(list).toContain('onClick={() => setOpenClientId(c.id)}');
    expect(card).toContain('href={`https://wa.me/${waDigits(profile.phone)}`}');
    expect(card.indexOf('{c.call}')).toBeLessThan(card.indexOf('{c.whatsapp}'));
    for (const lang of [en, hi]) expect(lang.clientCard.whatsapp).toBeTruthy();
  });

  it('draws one row per person: tinted initials, name and amount, facts in grey, a chevron', () => {
    for (const cls of ['cust-avatar', 'cust-card-top', 'cust-card-name', 'cust-card-amt', 'cust-card-sub', 'cust-card-facts']) {
      expect(list, cls).toContain(`className="${cls}"`);
      expect(css, cls).toContain(`.${cls} {`);
    }
    expect(list).toContain('<IconChevronRight />');
  });

  it('keeps every row the same height: facts clipped, never wrapped; a 44px+ row', () => {
    expect(css).toMatch(/\.cust-card-facts \{[^}]*white-space: nowrap;[^}]*\}/);
    expect(css).toMatch(/\.cust-card-name \{[^}]*text-overflow: ellipsis;[^}]*\}/);
    expect(css).toMatch(/\.cust-card \{[^}]*min-height: 4rem;/);
  });
});
