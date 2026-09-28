import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { copy } from '../app/(tenant)/lib/copy';
import en from '../messages/en.json';
import { flatten, pickNamespaces, withFallback, type Messages } from './messages';
import { AUTH_MESSAGES, CLIENT_MESSAGES } from './client-messages';

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

/**
 * The arguments and `<tag>` wrappers a message uses — what a translator must keep.
 * Read with the real ICU parser: a regex mistakes the text inside a `select`
 * branch (`{today}`) for an argument, and cannot see through a translated one.
 */
function placeholders(text: string): string[] {
  const found = new Set<string>();
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
      if (el.type === TYPE.tag) {
        found.add(`<${el.value}>`);
        walk(el.children);
      } else {
        found.add(el.value);
        if (el.type === TYPE.plural || el.type === TYPE.select) for (const opt of Object.values(el.options)) walk(opt.value);
      }
    }
  };
  walk(parse(text));
  return [...found].sort();
}

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

describe('the groups handed to the browser', () => {
  /** Every source file under web/app, so a new screen is covered without touching this test. */
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = `${dir}/${e}`;
      if (e === 'node_modules' || e === '.next') return [];
      return statSync(full).isDirectory() ? sources(full) : /\.(tsx|ts)$/.test(e) && !/\.test\./.test(e) ? [full] : [];
    });

  it('finds the screens at all', () => {
    expect(sources('web/app').length).toBeGreaterThan(100);
  });

  it('registers every group a component reads with useTranslations', () => {
    // `useTranslations` may run in a client component, or in a shared one a client
    // component imports — so every group it reads must be registered, not only
    // those in files marked 'use client'.
    const missing: string[] = [];
    for (const file of sources('web/app')) {
      for (const m of readFileSync(file, 'utf8').matchAll(/useTranslations\(\s*'([\w.]+)'\s*\)/g)) {
        const group = m[1]!.split('.')[0]!;
        // The sign-in pages have their own, smaller provider (AUTH_MESSAGES); everything else uses the dashboard's.
        const given: readonly string[] = file.includes('/(auth)/') ? AUTH_MESSAGES : CLIENT_MESSAGES;
        if (!given.includes(group)) missing.push(`${file}  useTranslations('${m[1]}')`);
      }
    }
    expect(missing, `\nThese read a message group the browser is never given (add it to web/i18n/client-messages.ts):\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('lists only groups that exist', () => {
    const known = Object.keys(en);
    expect((CLIENT_MESSAGES as readonly string[]).filter((g) => !known.includes(g))).toEqual([]);
    expect((AUTH_MESSAGES as readonly string[]).filter((g) => !known.includes(g))).toEqual([]);
  });
});

describe('words that live in copy.ts and messages/en.json while their other readers move', () => {
  // Reports, Staff and the CSV export still read `copy.status`, and Home's English
  // still reads `copy.clients`; the migrated screens read the message file. Until the
  // rest move, the English must be the same in both.
  it('status words', () => {
    expect(en.status).toEqual({ ...copy.status });
  });

  it('the minutes label Free times shares with other screens', () => {
    expect(en.freeTimes.minutes.replace('{count}', '45')).toBe(copy.services.minutes(45));
    expect(en.services.minutes.replace('{count}', '45')).toBe(copy.services.minutes(45));
    expect(en.services.cols.name).toBe(copy.services.name);
    expect(en.services.cols.duration).toBe(copy.services.duration);
    expect(en.services.cols.price).toBe(copy.services.price);
  });

  it('Reports: every plain sentence in copy.reports is the same in the message file', () => {
    // The CSV export still reads copy.reports (a file is not translated per viewer); the screens read the
    // messages. Function-valued entries become ICU messages and are covered by use-reports-copy's own test.
    const differing: string[] = [];
    const walk = (source: Record<string, unknown>, messages: Record<string, unknown>, path: string) => {
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'string') {
          if (messages[key] !== value) differing.push(`${path}${key}`);
        } else if (value && typeof value === 'object') {
          walk(value as Record<string, unknown>, (messages[key] ?? {}) as Record<string, unknown>, `${path}${key}.`);
        }
      }
    };
    walk(copy.reports as unknown as Record<string, unknown>, en.reports as unknown as Record<string, unknown>, '');
    expect(differing).toEqual([]);
  });

  it('client segment names, title and hint', () => {
    expect(en.customers.segments).toEqual(copy.clients.segments);
    expect(en.customers.segmentsTitle).toBe(copy.clients.segmentsTitle);
    expect(en.customers.segmentsHint).toBe(copy.clients.segmentsHint);
  });
});
