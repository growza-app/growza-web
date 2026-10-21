import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-621 — a marketplace's seller keys, on Settings › Online selling, pinned at the source.
 *
 * What was checked in a browser at 344px is in the PR. These keep the rules that must not drift: the screen is write-only (it holds no
 * value it was ever sent and shows none), a secret is typed masked and never autofilled, a half-set form is not sent, the state line
 * comes from what the marketplace said and not from keys merely existing, and every sentence has a Hindi twin.
 */
const here = (f: string) => readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
const keys = here('./ChannelKeys.tsx');
const form = here('./ChannelsForm.tsx');
const css = readFileSync(path.resolve(import.meta.dirname, '../../styles/99-channels.css'), 'utf8');
const types = readFileSync(path.resolve(import.meta.dirname, '../../lib/api-types.ts'), 'utf8');
const messages = (lang: 'en' | 'hi') => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../../../../messages', `${lang}.json`), 'utf8')).settingsChannels as Record<string, string>;

describe('write-only: the screen cannot show a key because it is never given one', () => {
  it('the connection type has no value anywhere — only which fields are set', () => {
    const block = types.slice(types.indexOf('export interface ChannelConnection'), types.indexOf('export type ChannelCheckResult'));
    expect(block).toContain('set: boolean');
    expect(block).not.toMatch(/\bvalue\b|\bsecret:\s*string|\bapplicationSecret\b/);
  });

  it('a saved field shows dots and "Saved", and the form opens empty — replacing means typing every key again', () => {
    expect(keys).toContain("placeholder={f.set ? '••••••••' : ''}");
    expect(keys).toContain("t('keysSet')");
    expect(keys).toContain("t('keysReplaceHint')");
    expect(keys).not.toMatch(/useState<Record<string, string>>\(\s*\{\s*\.\.\./);
  });

  it('masks a secret as it is typed, never autofills or spell-checks any key, and keeps the values after a failed save', () => {
    expect(keys).toContain("type={f.secret ? 'password' : 'text'}");
    expect(keys).toContain('autoComplete="off"');
    expect(keys).toContain('spellCheck={false}');
    expect(keys).toContain('The values stay in the fields so a retry does not mean typing them again.');
  });

  it('clears what was typed once it is saved, and when the form is cancelled', () => {
    expect(keys.match(/setValues\(\{\}\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('what it sends and when', () => {
  it('will not send a form with a field empty — the API refuses it too, but a half-set would only look connected', () => {
    expect(keys).toContain("(values[f.key] ?? '').trim() === ''");
    expect(keys).toContain("t('keysFieldNeeded'");
  });

  it('sends once (a double tap is one request) and sends only the fields the API declared', () => {
    expect(keys).toContain('if (inFlight.current || !conn) return;');
    expect(keys).toContain('conn.fields.map((f) => [f.key,');
    expect(keys).toContain('api.saveChannelKeys(channel,');
  });

  it('is offered to a writable session only — a suspended business sees the state, not the buttons', () => {
    expect(keys).toContain('const writable = useWritable();');
    expect(keys).toContain('open && writable');
    expect(keys).toContain('{writable ? (');
  });

  it('is rendered under each marketplace’s row', () => {
    expect(form).toContain('<ChannelKeys channel={row.channel} name={word(row.channel)} />');
  });
});

describe('the state line says what is true', () => {
  it('"Connected" needs a Check the marketplace accepted — saved keys alone read "not checked yet"', () => {
    expect(keys).toContain('last?.ok');
    expect(keys).toContain("t('keysSaved')");
    expect(keys).toContain("t('keysRefused'");
    expect(keys).toContain("t('keysUnreachableLast'");
  });

  it('says plainly when checking is not open yet, rather than pretending it worked', () => {
    expect(keys).toContain("unavailable: t('keysCheckUnavailable'");
    expect(keys).toContain("if (res.result !== 'unavailable') load();");
  });

  it('says so when the server cannot keep keys at all, and offers no form', () => {
    expect(keys).toContain('!conn.keysSetUp ?');
    expect(keys).toContain("e.status === 503 ? t('keysNotSetUp')");
  });

  it('reads the API’s error CODES for the two failures it has its own words for — never a stack or its English', () => {
    expect(keys).toContain("code === 'not_connected'");
    expect(keys).toContain("code === 'keys_unreadable'");
  });
});

describe('loading, empty and error states', () => {
  it('holds the height of the section while it loads, and offers a retry when it cannot', () => {
    expect(keys).toContain('stc-keys-loading');
    expect(keys).toContain("t('retry')");
    expect(css).toMatch(/\.stc-keys-loading\s*\{[^}]*min-height:\s*7\.5rem/);
  });
});

describe('UX', () => {
  it('has English and Hindi with the same keys and placeholders, in plain words — "keys", never "credentials", "token" or "API"', () => {
    const en = messages('en');
    const hi = messages('hi');
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    const slots = (s: string) => [...new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort();
    for (const k of Object.keys(en)) {
      expect(hi[k], k).toBeTruthy();
      expect(slots(hi[k]!), k).toEqual(slots(en[k]!));
    }
    for (const [k, v] of Object.entries(en)) {
      if (k.startsWith('keys')) expect(v, k).not.toMatch(/\b(credential|credentials|API|variant|SKU|pool)\b/i);
    }
    // The seller panels' own names stay as they are: an owner matches them against the screen they copy from.
    expect(en.fieldApplicationSecret).toBe('Application secret');
    expect(en.fieldRefreshToken).toBe('Refresh token');
  });

  it('draws full-width fields and buttons a thumb tall, 16px type on the field, tokens and rem, no animation', () => {
    expect(css).toMatch(/\.stc-input\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*2\.75rem;[^}]*font-size:\s*16px/);
    expect(css).toMatch(/\.stc-btn\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(css.replace(/font-size:\s*16px/g, '')).not.toMatch(/font-size:\s*\d+px/);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
  });

  it('uses the deep green for "Connected", which passes contrast; the lighter accent does not at this size', () => {
    expect(css).toMatch(/\.stc-state-ok\s*\{[^}]*color:\s*var\(--accent-deep\)/);
  });
});
