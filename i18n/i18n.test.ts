import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import en from '../messages/en.json';
import { flatten, pickNamespaces, withFallback, type Messages } from './messages';

/**
 * Jira GRW-319 — every language has every key, and a pending translation shows
 * English rather than a blank.
 *
 * The languages are read from `web/messages/`, so a new `xx.json` is checked
 * without touching this file.
 */

const DIR = 'web/messages';
const load = (file: string) => JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8')) as Messages;
const languages = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'en.json');

/** The `{name}` arguments and `<tag>` wrappers a message uses — what a translator must keep. */
const placeholders = (text: string) =>
  [...text.matchAll(/\{\s*(\w+)\s*[,}]|<(\w+)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort();

describe('the message files', () => {
  it('finds the languages at all', () => {
    // A test that compares against nothing passes forever.
    expect(languages).toContain('hi.json');
  });

  describe.each(languages)('%s', (file) => {
    const source = flatten(en as Messages);
    const theirs = flatten(load(file));

    it('has every key English has', () => {
      const missing = Object.keys(source).filter((k) => !(k in theirs));
      expect(missing, `${file} is missing:\n  ${missing.join('\n  ')}\nAdd the translation (see "Changing an English label" in Jira GRW-315).`).toEqual([]);
    });

    it('has no key English lacks', () => {
      const extra = Object.keys(theirs).filter((k) => !(k in source));
      expect(extra, `${file} has keys English does not:\n  ${extra.join('\n  ')}`).toEqual([]);
    });

    it('keeps every {argument} and <tag> of the English', () => {
      const broken = Object.keys(source)
        .filter((k) => k in theirs)
        .filter((k) => placeholders(source[k]!).join() !== placeholders(theirs[k]!).join());
      expect(broken, `${file}: these lost or changed a placeholder:\n  ${broken.join('\n  ')}`).toEqual([]);
    });
  });
});

describe('withFallback', () => {
  it('shows English for a key the language lacks, and its own text for one it has', () => {
    const merged = withFallback(
      { errors: { busy: 'Busy', down: 'Down' }, other: 'Other' },
      { errors: { busy: 'व्यस्त' } },
    );
    expect(merged).toEqual({ errors: { busy: 'व्यस्त', down: 'Down' }, other: 'Other' });
  });

  it('never returns a blank or a key for a missing translation', () => {
    const t = createTranslator({ locale: 'hi', messages: withFallback(en as Messages, { errors: {} }) as never });
    expect(t('errors.busy' as never)).toBe(en.errors.busy);
  });
});

describe('pickNamespaces', () => {
  it('keeps only the named groups, so the client is not handed the whole catalogue', () => {
    expect(Object.keys(pickNamespaces({ a: { x: '1' }, b: { y: '2' }, c: { z: '3' } }, ['a', 'c']))).toEqual(['a', 'c']);
  });
});

describe('ICU plurals', () => {
  const visits = (locale: 'en' | 'hi', count: number) => {
    const messages = (locale === 'en' ? en : load('hi.json')) as never;
    return createTranslator({ locale, messages })('search.visits' as never, { count } as never);
  };

  it('is right in English for 0, 1 and 2', () => {
    expect([0, 1, 2].map((n) => visits('en', n))).toEqual(['0 visits', '1 visit', '2 visits']);
  });

  it('is right in Hindi for 0, 1 and 2', () => {
    expect([0, 1, 2].map((n) => visits('hi', n))).toEqual(['0 विज़िट', '1 विज़िट', '2 विज़िट']);
  });
});
