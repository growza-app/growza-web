import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_MESSAGES_HI, localiseApiMessage } from './api-messages';

/** Jira GRW-365 */
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sources(full);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });

describe('the server sentences we have in Hindi', () => {
  it('shows Hindi in a Hindi page, English otherwise, and never loses an unknown sentence', () => {
    expect(localiseApiMessage('Phone number or password is incorrect.', 'hi')).toBe('फ़ोन नंबर या पासवर्ड ग़लत है।');
    expect(localiseApiMessage('Phone number or password is incorrect.', 'en')).toBe('Phone number or password is incorrect.');
    expect(localiseApiMessage('Some brand new server sentence.', 'hi')).toBe('Some brand new server sentence.');
  });

  it('every key still appears, word for word, in the API source (a reworded sentence would orphan its Hindi)', () => {
    const all = sources(path.resolve('src')).map((f) => readFileSync(f, 'utf8')).join('\n');
    // Sources write these as '…' literals, sometimes with an escaped apostrophe.
    const missing = Object.keys(API_MESSAGES_HI).filter((k) => !all.includes(k) && !all.includes(k.replace(/'/g, "\\'")));
    expect(missing).toEqual([]);
  });

  it('has no empty translation', () => {
    for (const [en, hi] of Object.entries(API_MESSAGES_HI)) expect(hi.trim().length, en).toBeGreaterThan(3);
  });
});

/**
 * The other direction (review, 2026-10-11).
 *
 * The test above stops a translation being orphaned. Nothing stopped the opposite — a NEW refusal written in
 * English on a route the dashboard calls, shipped untranslated, read by an owner in the middle of being told
 * something had gone wrong. That is the worst moment to hand somebody a language they do not read.
 *
 * So the routes a salon's screens actually call are scanned, and every sentence they can send must be in the
 * dictionary. The scan is deliberately narrow rather than allowlisted: the admin portal is English by decision
 * (BR-01), the billing ledger's notes are read by Growza and not by a salon, and the chat interpreter talks to
 * a customer in WhatsApp rather than to this dashboard. None of those are in the roots below, so none of them
 * needs excusing one sentence at a time.
 */
describe('the sentences a salon screen can be sent', () => {
  /** What a controller hands a client: `detail`/`message` on a refusal, and the domain errors they re-throw. */
  const SAYS = /(?:message|detail)\s*:\s*'((?:[^'\\]|\\.)+)'/g;
  const THROWN = /super\(\s*'((?:[^'\\]|\\.)+)'/g;

  /** Prose, not a code or a fragment: more than one word, starting like a sentence, nothing interpolated. */
  const isSentence = (t: string) => t.includes(' ') && t[0] === t[0]!.toUpperCase() && t.length > 12 && !t.includes('${');

  const ROOTS = [
    'api/tenant',
    'api/tenant-auth-routes.ts',
    'api/security/tenant-guard.ts',
    'modules/booking',
    'modules/customer',
    'modules/catalog',
    'modules/identity',
    'modules/attendance',
    'modules/scheduling',
    'modules/tenant',
  ];

  it('are all in the dictionary, so a Hindi page never falls back to English', () => {
    const files = ROOTS.flatMap((r) => {
      const full = path.resolve('src', r);
      return statSync(full).isDirectory() ? sources(full) : [full];
    });
    expect(files.length, 'the roots moved — fix ROOTS rather than let this pass on nothing').toBeGreaterThan(30);

    const untranslated: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const re of [SAYS, THROWN]) {
        re.lastIndex = 0;
        for (const m of src.matchAll(re)) {
          const text = m[1]!.replace(/\\'/g, "'");
          if (isSentence(text) && !(text in API_MESSAGES_HI)) untranslated.push(`${text}   (${file.split('/src/')[1]})`);
        }
      }
    }
    expect([...new Set(untranslated)].sort()).toEqual([]);
  });
});
