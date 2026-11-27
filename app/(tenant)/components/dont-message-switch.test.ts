import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';

const card = readFileSync(join(__dirname, 'ClientProfileCard.tsx'), 'utf8');

/** Owner, 2026-11-27 — "Don't message" on the client card: a guest who asks not to be sent anything is switched off. */
describe("the client card's Don't message switch", () => {
  it('sends only the switch, and draws what the server answered', () => {
    expect(card).toContain('api.updateCustomer(clientId, { dontMessage: on })');
    expect(card).toContain('optedOut: updated.optedOut ?? on');
  });

  it('is drawn for a guest with a number, and only someone who may correct the card can move it', () => {
    expect(card).toContain('{profile.phone ? (');
    expect(card).toContain('disabled={quietSaving || !mayEdit}');
    expect(card).toContain('checked={profile.optedOut === true}');
    expect(card).toContain('aria-labelledby="cpc-quiet-label"');
  });

  it('has its words in English and Hindi', () => {
    for (const key of ['messages', 'dontMessage', 'dontMessageOn', 'dontMessageOff', 'dontMessageFailed'] as const) {
      expect(en.clientCard[key], key).toBeTruthy();
      expect(hi.clientCard[key], key).toBeTruthy();
      expect(hi.clientCard[key]).not.toBe(en.clientCard[key]);
    }
    expect(en.clientCard.dontMessage).toBe("Don't message");
  });
});
