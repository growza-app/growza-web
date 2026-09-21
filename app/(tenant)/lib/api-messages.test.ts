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
