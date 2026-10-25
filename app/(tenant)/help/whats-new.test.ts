import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { WHATS_NEW, whatsNewFor } from './whats-new';
import { ROLE_KEY, type HelpRole } from './links';

const here = fileURLToPath(new URL('.', import.meta.url));
const page = readFileSync(resolve(here, 'page.tsx'), 'utf8');

type Item = { title: string; body: string; go?: string };
const block = (m: typeof en) =>
  (m.help as unknown as { new: { heading: string; lede: string; open: string; items: Record<string, Item> } }).new;

const ROLES = Object.keys(ROLE_KEY) as HelpRole[];

/**
 * "What's new" on the Help screen. Structure here, words in the messages — the same split the quick fixes
 * above it use, and these keep the two from drifting.
 *
 * An owner finds out what their own product can do by being told in a WhatsApp message, or not at all. That
 * is what this list is for, and it is worth only as much as it is true: an entry whose words are missing is a
 * blank line, and one that promises a screen the reader cannot open is worse than nothing.
 */
describe('what’s new', () => {
  it('is on the Help screen, under the quick fixes', () => {
    expect(page).toContain('<WhatsNew');
    expect(page.indexOf('<QuickFixes')).toBeLessThan(page.indexOf('<WhatsNew'));
  });

  it('is newest first, and every date is a real one', () => {
    const dates = WHATS_NEW.map((t) => t.on);
    for (const on of dates) {
      expect({ on, valid: /^\d{4}-\d{2}-\d{2}$/.test(on) && !Number.isNaN(Date.parse(on)) }).toEqual({ on, valid: true });
    }
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it('is a list of what is new, not a changelog', () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
    expect(WHATS_NEW.length).toBeLessThanOrEqual(12);
    expect(new Set(WHATS_NEW.map((t) => t.id)).size).toBe(WHATS_NEW.length);
  });

  it('offers every entry to a role that exists, and nothing to nobody', () => {
    for (const thing of WHATS_NEW) {
      if (thing.roles === 'all') continue;
      expect({ id: thing.id, empty: thing.roles.length === 0 }).toEqual({ id: thing.id, empty: false });
      for (const role of thing.roles) expect(ROLES).toContain(role);
    }
  });

  it('shows a stylist only what a stylist can use, and the owner the lot', () => {
    expect(whatsNewFor('owner')).toHaveLength(WHATS_NEW.length);
    const staff = whatsNewFor('staff').map((t) => t.id);
    expect(staff.length).toBeGreaterThan(0);
    expect(staff).not.toContain('rewards');
    // Signed out of a role we recognise, somebody still sees the entries everybody gets.
    expect(whatsNewFor(null).every((t) => t.roles === 'all')).toBe(true);
  });

  for (const [lang, messages] of [['English', en], ['Hindi', hi]] as const) {
    describe(lang, () => {
      const words = block(messages);

      it('has a heading, a lede and a word on the card', () => {
        for (const key of ['heading', 'lede', 'open'] as const) expect(words[key].length).toBeGreaterThan(0);
      });

      it('has a title and a line for every entry, and no words for an entry that does not exist', () => {
        for (const thing of WHATS_NEW) {
          const item = words.items[thing.id];
          expect({ id: thing.id, has: Boolean(item?.title && item?.body) }).toEqual({ id: thing.id, has: true });
        }
        expect(Object.keys(words.items).sort()).toEqual(WHATS_NEW.map((t) => t.id).sort());
      });

      it('names where to go only where there is somewhere to go', () => {
        for (const thing of WHATS_NEW) {
          expect({ id: thing.id, go: Boolean(words.items[thing.id]?.go) }).toEqual({ id: thing.id, go: Boolean(thing.href) });
        }
      });
    });
  }

  it('links only to screens this app actually has', () => {
    const routes = ['/settings/rewards', '/settings/alerts', '/reports', '/products'];
    for (const thing of WHATS_NEW) {
      if (!thing.href) continue;
      expect({ id: thing.id, known: routes.includes(thing.href) }).toEqual({ id: thing.id, known: true });
    }
  });
});
