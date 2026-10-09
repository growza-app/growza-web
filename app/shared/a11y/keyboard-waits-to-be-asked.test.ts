import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { autoFocusField, takesTyping } from './soft-keyboard';

/**
 * The keyboard does not arrive before the page does.
 *
 * Every screen with a text field used to raise the on-screen keyboard on arrival, because `autoFocus` means the
 * same thing on a desktop and on a phone, and on a phone it covers half of what the person came to read. The fix
 * is one helper, so this is a census: no component may spell `autoFocus` on its own again, and the two hooks that
 * move focus for a dialog must ask whether a keyboard would follow.
 */
const app = resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = resolve(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(path);
    return e.isFile() && e.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('auto-focus across the whole dashboard', () => {
  it('always goes through autoFocusField — no component decides for itself', () => {
    const offenders = sources(app)
      .filter((path) => !path.endsWith('.test.tsx'))
      .flatMap((path) => {
        const src = readFileSync(path, 'utf8');
        return src
          .split('\n')
          .map((line, i) => ({ line: line.trim(), at: `${path.slice(app.length + 1)}:${i + 1}` }))
          .filter(({ line }) => /\bautoFocus\b/.test(line) && !/autoFocusField\(/.test(line))
          // PhoneField and the admin TextInput only pass the answer down; they do not decide it.
          .filter(({ line }) => !/autoFocus(\?)?:|autoFocus = false|autoFocus=\{autoFocus\}/.test(line))
          .map(({ at }) => at);
      });
    expect(offenders).toEqual([]);
  });

  it('is skipped where focusing a field would raise a keyboard, and kept where it would not', () => {
    const media = (coarse: boolean) => {
      (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: coarse }) };
    };
    media(false);
    expect(autoFocusField()).toBe(true);
    expect(autoFocusField(false)).toBe(false); // a caller's own "not yet" still wins
    media(true);
    expect(autoFocusField()).toBe(false);
    // On the server the question cannot be asked, and the answer is the desktop one — which is what the server
    // already emitted, since React drops `autoFocus` from its HTML and applies it when the component mounts.
    delete (globalThis as { window?: unknown }).window;
    expect(autoFocusField()).toBe(true);
  });
});

describe('a dialog opening on a phone', () => {
  it('lands on the dialog, not in its first field', () => {
    const hook = readFileSync(resolve(__dirname, 'useDialog.ts'), 'utf8');
    expect(hook).toMatch(/if \(first && takesTyping\(first\) && opensSoftKeyboard\(\)\) first = undefined;/);
    // The dialog itself still takes focus, which is what a screen reader needs to announce it.
    expect(hook).toMatch(/const target = first \?\? root;/);
  });

  it('knows which controls bring a keyboard with them', () => {
    const el = (tagName: string, type = '') => ({ tagName, type, isContentEditable: false }) as unknown as HTMLElement;
    for (const type of ['text', 'tel', 'password', 'search', 'number', 'email']) expect(takesTyping(el('INPUT', type))).toBe(true);
    for (const type of ['checkbox', 'radio', 'date', 'time', 'file', 'submit']) expect(takesTyping(el('INPUT', type))).toBe(false);
    expect(takesTyping(el('TEXTAREA'))).toBe(true);
    expect(takesTyping(el('BUTTON'))).toBe(false);
    expect(takesTyping(el('SELECT'))).toBe(false);
    expect(takesTyping({ tagName: 'DIV', isContentEditable: true } as unknown as HTMLElement)).toBe(true);
  });
});
