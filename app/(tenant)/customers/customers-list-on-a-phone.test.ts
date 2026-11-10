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

  it('draws one row per person: a cartoon face, name and amount, facts in grey, a chevron', () => {
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

describe("the owner's round theme on a phone (10 Nov 2026)", () => {
  it('draws the groups as round pills that filter, each with its colour on its left edge', () => {
    expect(list).toContain('className="cust-pill"');
    expect(list).toContain('aria-pressed={on}');
    expect(css).toMatch(/\.cust-pill \{[^}]*border-radius: 999px;[^}]*border-left: 3px solid var\(--seg, var\(--border\)\);/);
    expect(css).toMatch(/\.cust-pill \{[^}]*min-height: 2\.75rem;/);
  });

  it('draws each row as a capsule whose left arc is its group colour', () => {
    expect(list).toContain("style={SEGMENT_TONE[c.segment] ? { ['--seg' as string]: SEGMENT_TONE[c.segment] } : undefined}");
    expect(css).toMatch(/\.cust-card,\s*\.cust-card:last-child \{[^}]*border-left: 3px solid var\(--seg, var\(--border\)\);[^}]*border-radius: 2\.25rem;/);
  });

  it('keeps the group in words beside its colour on the All view, and drops it where the pill already says it', () => {
    expect(list).toContain("{status === 'all' ? chipOf(c.segment) : null}");
  });

  it('is a phone thing: a laptop keeps its table, panel and Filter menu', () => {
    expect(css).toMatch(/\.cust-pills \{\s*display: none;\s*\}/);
  });
});
