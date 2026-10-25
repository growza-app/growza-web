import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AddBusinessModal } from './AddBusinessModal';
import { AddAdminModal } from '../users/AddAdminModal';

/**
 * QA 2026-10-25 — the phone boxes, as the browser actually receives them.
 *
 * The admin portal cannot be opened in a browser here: its session is an HttpOnly cookie the API sets behind
 * a password, and the one password this machine has lives in a git-ignored env file and is not typed into
 * anything. So the component is rendered instead, and the real markup is asked the questions a tester would
 * have asked the real field.
 *
 * That is a better test than reading the source for `type="tel"` anyway. A prop can be written in a file and
 * still not reach the input — spread over, renamed by a wrapper, dropped by a primitive that picks the props
 * it passes on. This renders the actual component through the actual `TextInput` and reads what comes out.
 */
/** The one `<input>` whose id ends with this suffix — React's own prefix is a moving part, the suffix is not. */
const attributesOf = (html: string, idEndsWith: string) => {
  const tags = html.match(/<input [^>]*>/g) ?? [];
  const found = tags.filter((tag) => new RegExp(`id="[^"]*${idEndsWith}"`).test(tag));
  expect({ idEndsWith, matches: found.length }).toEqual({ idEndsWith, matches: 1 });
  return found[0]!;
};

const businessModal = renderToStaticMarkup(
  createElement(AddBusinessModal as never, { onClose: () => {}, onCreated: () => {} } as never),
);
const adminModal = renderToStaticMarkup(
  createElement(AddAdminModal as never, { open: true, roles: [], onClose: () => {}, onAdded: () => {} } as never),
);

describe('the owner’s phone box on the enrolment form', () => {
  const input = attributesOf(businessModal, 'owner-phone');

  it('asks for a phone keypad in both the ways that matter', () => {
    // `inputMode` is a hint some keyboards ignore; `type` is the one they act on. Both, or a tablet at a
    // salon desk opens a letter keyboard for a number that cannot contain letters.
    expect(input).toContain('type="tel"');
    expect(input).toContain('inputMode="numeric"');
  });

  it('carries no maxLength, whatever the length rule says', () => {
    /*
     * The tenant app tried `maxLength={10}` and it corrupted the number it was meant to protect: the browser
     * truncates the raw string before any code sees it, so an autofilled "+919876500001" arrived as
     * "+919876500" — nine digits and somebody else's number. `PhoneField` carries that scar in a comment.
     * The length belongs in the change handler, after the prefixes come off.
     */
    expect(input).not.toContain('maxLength');
  });

  it('is named for a screen reader, and the dial code beside it is not', () => {
    expect(input).toContain('aria-label="Owner&#x27;s phone number, +91"');
    // The +91 is chrome: an admin cannot edit it, tab to it, or hear it twice.
    expect(businessModal).toContain('<span aria-hidden="true"');
  });
});

describe('the phone box on Add admin', () => {
  const input = attributesOf(adminModal, '-phone');

  it('asks for the same keypad — it had neither type nor inputMode', () => {
    expect(input).toContain('type="tel"');
    expect(input).toContain('inputMode="tel"');
  });

  it('has no length of its own, because it takes the whole international number', () => {
    expect(input).not.toContain('maxLength');
    expect(input).toContain('placeholder="+91 98765 43210"');
  });
});
