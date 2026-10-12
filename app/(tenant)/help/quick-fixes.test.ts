import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { fixesFor, QUICK_FIXES, type FixRole } from './quick-fixes';

const here = fileURLToPath(new URL('.', import.meta.url));
const page = readFileSync(resolve(here, 'page.tsx'), 'utf8');

type Steps = Record<string, string>;
type Topic = { title: string; note?: string } & Partial<Record<'main' | 'iphone' | 'android', Steps>>;
const fixes = (m: typeof en) => (m.help as unknown as { fixes: { topics: Record<string, Topic>; cats: Record<string, { title: string }>; heading: string; lede: string; labels: Record<string, string> } }).fixes;

const ALL_TOPICS = QUICK_FIXES.flatMap((c) => c.topics);
const ROLES: FixRole[] = ['owner', 'manager', 'receptionist', 'staff'];

/**
 * Jira GRW-564 — the help screen's quick fixes. The words are in the messages and the structure is in
 * quick-fixes.ts; these keep them from drifting: a step that the data promises and the copy does not have is a
 * blank line on a screen somebody opens because something is already wrong.
 */
describe('the quick fixes', () => {
  for (const [lang, messages] of [['English', en], ['Hindi', hi]] as const) {
    describe(lang, () => {
      const f = fixes(messages);

      it('has a title for every group and every problem, and a step for every step the data promises', () => {
        for (const c of QUICK_FIXES) {
          expect(f.cats[c.id]?.title, `group ${c.id}`).toBeTruthy();
          for (const t of c.topics) {
            const topic = f.topics[t.id];
            expect(topic?.title, `topic ${t.id}`).toBeTruthy();
            for (const s of t.sections) {
              for (let i = 1; i <= s.steps; i++) expect(topic?.[s.id]?.[`s${i}`], `${t.id}.${s.id}.s${i}`).toBeTruthy();
              // …and no step the data does not draw.
              expect(Object.keys(topic?.[s.id] ?? {}).length, `${t.id}.${s.id} has extra steps`).toBe(s.steps);
            }
            if (t.note) expect(topic?.note, `${t.id}.note`).toBeTruthy();
            else expect(topic?.note, `${t.id} has a note the data does not draw`).toBeUndefined();
          }
        }
      });

      it('has no copy for a problem that is not in the data', () => {
        expect(Object.keys(f.topics).sort()).toEqual(ALL_TOPICS.map((t) => t.id).sort());
      });

      it('leaves no placeholder behind — every quoted button name was filled in', () => {
        const everything = JSON.stringify(f);
        expect(everything).not.toMatch(/\{[a-zA-Z]+\}/);
      });

      it('has the section’s own words', () => {
        expect(f.heading).toBeTruthy();
        expect(f.lede).toBeTruthy();
        expect(f.labels.iphone).toBeTruthy();
        expect(f.labels.android).toBeTruthy();
      });
    });
  }

  it('is named as asked: Location check-in, and what goes wrong', () => {
    expect(fixes(en).topics['cant-in']!.title).toBe('Location check-in: “I’m in” doesn’t work');
    expect(fixes(hi).topics['cant-in']!.title).toContain('लोकेशन से हाज़िरी');
  });

  it('quotes the button names the screen shows in that language, not English in a Hindi sentence', () => {
    // The booking sheet's own labels, in each language.
    expect(fixes(en).topics.move!.main!.s2).toContain(en.bookingSheet.reschedule);
    expect(fixes(hi).topics.move!.main!.s2).toContain(hi.bookingSheet.reschedule);
    expect(fixes(hi).topics.move!.main!.s2).not.toContain(en.bookingSheet.reschedule);
    expect(fixes(hi).topics.record!.main!.s3).toContain(hi.newVisit.howPaid);
  });

  it('is short: every problem is at most five steps, and every step one sentence’s worth', () => {
    for (const t of ALL_TOPICS) {
      for (const s of t.sections) expect(s.steps, `${t.id}.${s.id}`).toBeLessThanOrEqual(5);
    }
    for (const messages of [en, hi]) {
      for (const [id, topic] of Object.entries(fixes(messages).topics)) {
        for (const sec of ['main', 'iphone', 'android'] as const) {
          for (const [k, text] of Object.entries(topic[sec] ?? {})) expect(text.length, `${id}.${sec}.${k}`).toBeLessThan(170);
        }
      }
    }
  });

  it('has unique ids', () => {
    const ids = ALL_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('who is offered what', () => {
    const idsFor = (role: FixRole | null) => fixesFor(role).flatMap((c) => c.topics.map((t) => t.id));

    it('a stylist is not offered payments, clients or the team — steps they cannot do', () => {
      const staff = fixesFor('staff').map((c) => c.id);
      expect(staff).not.toContain('payments');
      expect(staff).not.toContain('clients');
      expect(staff).not.toContain('team');
      expect(idsFor('staff')).toContain('cant-in');
      expect(idsFor('staff')).toContain('mark-in-out');
    });

    it('a stylist can mark a booking done and see what is new, and nothing that moves or cancels one', () => {
      const ids = idsFor('staff');
      expect(ids).toContain('done');
      expect(ids).toContain('news');
      for (const no of ['move', 'cancel', 'correct', 'add-booking']) expect(ids).not.toContain(no);
    });

    it('an owner is not told how to mark themselves in', () => {
      expect(idsFor('owner')).not.toContain('cant-in');
      expect(idsFor('owner')).not.toContain('mark-in-out');
      expect(idsFor('owner')).toContain('setup');
    });

    it('only the owner and manager are told how to switch it on, and invite people', () => {
      for (const id of ['setup', 'invite', 'add-qr', 'bill']) {
        expect(idsFor('owner')).toContain(id);
        expect(idsFor('manager')).toContain(id);
        expect(idsFor('receptionist')).not.toContain(id);
        expect(idsFor('staff')).not.toContain(id);
      }
    });

    it('the front desk gets the desk’s problems: bookings, payments, clients, the register', () => {
      const ids = idsFor('receptionist');
      for (const id of ['add-booking', 'move', 'cancel', 'record', 'show-qr', 'send-bill', 'add-client', 'register', 'approve']) {
        expect(ids, id).toContain(id);
      }
    });

    it('everybody is offered the phone group, whatever their role', () => {
      for (const role of ROLES) expect(fixesFor(role)[0]!.id).toBe('phone');
    });

    it('an unknown role — /me unreachable — is offered everything, not less', () => {
      expect(idsFor(null).sort()).toEqual(ALL_TOPICS.map((t) => t.id).sort());
    });

    it('a group nobody in the role could use is not drawn empty', () => {
      for (const role of ROLES) for (const c of fixesFor(role)) expect(c.topics.length).toBeGreaterThan(0);
    });
  });

  describe('the section on the page', () => {
    const section = readFileSync(resolve(here, 'QuickFixes.tsx'), 'utf8');
    const css = readFileSync(resolve(here, '../styles/99-help.css'), 'utf8');

    it('sits under the people, and is given the role', () => {
      expect(page.indexOf('<QuickFixes')).toBeGreaterThan(page.indexOf('help-reply'));
      expect(page).toMatch(/<QuickFixes role=\{isHelpRole\(role\) \? role : null\}/);
    });

    it('is native <details>: closed by default, so the page shows six lines, not twenty-three problems', () => {
      expect(section).toMatch(/<details key=\{group\.id\} className="help-cat">/);
      expect(section).toMatch(/<details key=\{topic\.id\} className="help-topic">/);
      expect(section).not.toMatch(/<details[^>]*\bopen\b/);
      expect(section).not.toMatch(/useState|useEffect|'use client'/);
    });

    it('is tappable at 44px or more and honours reduced motion', () => {
      expect(css).toMatch(/\.help-cat-head,\s*\.help-topic-head\s*\{[^}]*min-height:\s*56px/);
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.help-chevron/);
    });

    it('draws its icons from the icon set, never an emoji', () => {
      expect(section).toMatch(/from '\.\.\/components\/icons'/);
      expect(JSON.stringify(fixes(en)) + JSON.stringify(fixes(hi))).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });
});
