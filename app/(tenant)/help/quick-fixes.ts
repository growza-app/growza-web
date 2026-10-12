import type { HelpRole } from './links';

/**
 * The help screen's self-help section: groups of problems, each opening to a few numbered steps.
 *
 * This file is only STRUCTURE — which groups exist, which role is offered which problem, and how many steps a
 * problem has. The words are `help.fixes.*` in the messages, in both languages, and every button name a step
 * quotes was read out of the product's own messages for that language, so a step cannot name a button the
 * screen does not have. The test next to this file holds the two together.
 *
 * Roles: a stylist is not offered how to take a payment, and an owner is not offered how to mark themselves
 * in — a step the reader cannot do is worse than no step. `'all'` is everybody.
 */

export type FixRole = HelpRole;
export type FixSectionId = 'main' | 'iphone' | 'android';

export interface FixTopic {
  id: string;
  roles: 'all' | readonly FixRole[];
  /** In reading order. `iphone` / `android` are labelled lists; `main` is not. */
  sections: readonly { id: FixSectionId; steps: number }[];
  /** A closing sentence under the steps — a caveat, or what to do when the steps did not work. */
  note?: true;
}

export interface FixCategory {
  id: 'phone' | 'checkin' | 'bookings' | 'payments' | 'clients' | 'team';
  topics: readonly FixTopic[];
}

export const QUICK_FIXES: readonly FixCategory[] = [
  {
    id: 'phone',
    topics: [
      { id: 'home-screen', roles: 'all', sections: [{ id: 'iphone', steps: 4 }, { id: 'android', steps: 2 }], note: true },
      { id: 'stuck', roles: 'all', sections: [{ id: 'main', steps: 3 }] },
      { id: 'account', roles: 'all', sections: [{ id: 'main', steps: 3 }] },
      { id: 'forgot', roles: 'all', sections: [{ id: 'main', steps: 3 }] },
    ],
  },
  {
    id: 'checkin',
    topics: [
      { id: 'cant-in', roles: ['staff'], sections: [{ id: 'main', steps: 3 }, { id: 'iphone', steps: 1 }, { id: 'android', steps: 1 }], note: true },
      { id: 'mark-in-out', roles: ['staff'], sections: [{ id: 'main', steps: 3 }], note: true },
      { id: 'approve', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }], note: true },
      { id: 'register', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'setup', roles: ['owner', 'manager'], sections: [{ id: 'main', steps: 5 }] },
    ],
  },
  {
    id: 'bookings',
    topics: [
      { id: 'add-booking', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'move', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'cancel', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'done', roles: 'all', sections: [{ id: 'main', steps: 2 }] },
      { id: 'correct', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'news', roles: 'all', sections: [{ id: 'main', steps: 2 }] },
    ],
  },
  {
    id: 'payments',
    topics: [
      { id: 'record', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'show-qr', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 4 }], note: true },
      { id: 'add-qr', roles: ['owner', 'manager'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'send-bill', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
    ],
  },
  {
    id: 'clients',
    topics: [
      { id: 'add-client', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 3 }] },
      { id: 'find-client', roles: ['owner', 'manager', 'receptionist'], sections: [{ id: 'main', steps: 2 }] },
    ],
  },
  {
    id: 'team',
    topics: [
      { id: 'invite', roles: ['owner', 'manager'], sections: [{ id: 'main', steps: 4 }] },
      { id: 'bill', roles: ['owner', 'manager'], sections: [{ id: 'main', steps: 2 }] },
    ],
  },
] as const;

/**
 * What this person is offered. A group with nothing in it for them is not drawn at all.
 *
 * An unknown role — `/me` could not be read — is offered everything: this is a help page, and a page that
 * shows less because something is already wrong would be the opposite of its job.
 */
export function fixesFor(role: FixRole | null): { id: FixCategory['id']; topics: FixTopic[] }[] {
  return QUICK_FIXES.map((c) => ({
    id: c.id,
    topics: c.topics.filter((t) => role === null || t.roles === 'all' || t.roles.includes(role)),
  })).filter((c) => c.topics.length > 0);
}
