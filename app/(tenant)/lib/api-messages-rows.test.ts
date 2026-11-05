import { describe, expect, it } from 'vitest';
import { API_MESSAGES_HI, localiseApiMessage } from './api-messages';

/** Owner, 2026-10-18 — a spreadsheet import names the row, then says why. The reason is translated; the row keeps its number. */
describe('the refusals of a spreadsheet import, in Hindi', () => {
  it('keeps the row number and translates the reason', () => {
    expect(localiseApiMessage('Row 12: An HSN code is 4 to 8 digits', 'hi')).toBe('पंक्ति 12: HSN कोड 4 से 8 अंकों का होना चाहिए');
    expect(localiseApiMessage('Row 7: Another product at this branch has that barcode', 'hi')).toMatch(/^पंक्ति 7: /);
  });

  it('leaves a reason it does not know in English, under the translated row label — never blank', () => {
    expect(localiseApiMessage('Row 3: "Gel" is in the file twice', 'hi')).toBe('पंक्ति 3: "Gel" is in the file twice');
  });

  it('changes nothing in English, and nothing that is not a row', () => {
    expect(localiseApiMessage('Row 12: An HSN code is 4 to 8 digits', 'en')).toBe('Row 12: An HSN code is 4 to 8 digits');
    expect(localiseApiMessage('Rowing is fun: yes', 'hi')).toBe('Rowing is fun: yes');
  });

  it('has the file-level sentences the import dialog can show', () => {
    for (const k of ['Upload a .xlsx or .csv file.', 'That file has no rows in it.', 'That file has column headings but nothing under them.']) expect(API_MESSAGES_HI[k], k).toBeTruthy();
  });
});

/** Jira GRW-678 (RET-01) — "not enough on the shelf" carries a number and the shop's own name for the thing. */
describe('how many are left, in Hindi', () => {
  it('translates the sentence and keeps the name and the number', () => {
    expect(localiseApiMessage('Only 3 left of White Shirt', 'hi')).toBe('White Shirt: सिर्फ़ 3 बचे हैं');
    expect(localiseApiMessage('Only 2 left of Grey Trousers (28)', 'hi')).toBe('Grey Trousers (28): सिर्फ़ 2 बचे हैं');
    expect(localiseApiMessage('White Shirt is out of stock', 'hi')).toBe('White Shirt: स्टॉक ख़त्म है');
  });

  it('changes nothing in English', () => {
    expect(localiseApiMessage('Only 3 left of White Shirt', 'en')).toBe('Only 3 left of White Shirt');
    expect(localiseApiMessage('White Shirt is out of stock', 'en')).toBe('White Shirt is out of stock');
  });

  it('a whole-sentence translation still wins, and a near miss is left alone', () => {
    expect(localiseApiMessage('That item is not for sale here', 'hi')).toBe(API_MESSAGES_HI['That item is not for sale here']);
    expect(localiseApiMessage('Only a few left', 'hi')).toBe('Only a few left');
  });

  it('has the other sentences these fixes send', () => {
    for (const k of [
      'A package needs a price above ₹0',
      'Somebody has already taken payment for this booking.',
      'This booking was cancelled, so it cannot be paid for.',
      'That product was sold in sizes. Say which size is coming back',
    ]) {
      expect(API_MESSAGES_HI[k], k).toBeTruthy();
    }
  });
});
