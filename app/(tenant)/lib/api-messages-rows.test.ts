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
