import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { keysState, mayEditKeys } from '../../lib/channel-keys-state';

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

  it('a saved field reads "Saved" (the dots beside it are decoration, hidden from a screen reader), and the form opens empty — replacing means typing every key again', () => {
    expect(keys).toContain("t('keysSet')");
    expect(keys).toContain('<span aria-hidden="true">•••••••• </span>');
    expect(keys).toContain("t('keysReplaceHint')");
    expect(keys).not.toMatch(/useState<Record<string, string>>\(\s*\{\s*\.\.\./);
  });

  it('an empty field has NO placeholder of dots: they look like something typed, and then "is needed" reads as a lie', () => {
    expect(keys).not.toMatch(/placeholder=/);
  });

  it('masks a secret as it is typed and keeps every password manager out: `new-password` (which browsers honour; `off` is ignored on a password field) plus the three managers’ own attributes', () => {
    expect(keys).toContain("type={f.secret ? 'password' : 'text'}");
    expect(keys).toContain("autoComplete={f.secret ? 'new-password' : 'off'}");
    expect(keys).toContain("'data-1p-ignore': true");
    expect(keys).toContain("'data-lpignore': 'true'");
    expect(keys).toContain("'data-bwignore': 'true'");
    expect(keys).toContain('spellCheck={false}');
  });

  it('keeps the values after a failed save so a retry does not mean typing them again', () => {
    expect(keys).toContain('The values stay in the fields so a retry does not mean typing them again.');
  });

  it('clears what was typed once it is saved, and when the form is cancelled', () => {
    // Once, after the save resolves (inside the `try`), and once on Cancel — never in the `catch`, which keeps them.
    const trySave = keys.slice(keys.indexOf('const res = await api.saveChannelKeys'), keys.indexOf('} catch (e) {'));
    expect(trySave).toContain('setValues({})');
    const catchSave = keys.slice(keys.indexOf('} catch (e) {'), keys.indexOf('const check = async'));
    expect(catchSave).not.toContain('setValues({})');
    expect(keys).toMatch(/setOpen\(false\);\s*setValues\(\{\}\);\s*setProblem\(null\);/);
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
    expect(keys).toContain('const mayEdit = mayEditKeys(conn, writable);');
    expect(keys).toContain('open && mayEdit ?');
    expect(keys).toContain('{writable ? (');
  });

  it('is rendered under each marketplace’s row', () => {
    expect(form).toContain('<ChannelKeys channel={row.channel} name={word(row.channel)} />');
  });
});

describe('the state line says what is true', () => {
  const at = '2026-10-21T05:00:00.000Z';
  it('"Connected" needs a Check the marketplace accepted — saved keys alone read "saved, not checked yet", and no keys read "not connected"', () => {
    expect(keysState({ saved: false, lastCheck: null })).toEqual({ key: 'notConnected', tone: 'off' });
    expect(keysState({ saved: true, lastCheck: null })).toEqual({ key: 'saved', tone: 'idle' });
    expect(keysState({ saved: true, lastCheck: { at, ok: true, reason: null } })).toEqual({ key: 'working', tone: 'ok' });
  });

  it('a refusal and an unreachable marketplace are different lines, and both are "bad"', () => {
    expect(keysState({ saved: true, lastCheck: { at, ok: false, reason: 'rejected' } })).toEqual({ key: 'refused', tone: 'bad' });
    expect(keysState({ saved: true, lastCheck: { at, ok: false, reason: 'unreachable' } })).toEqual({ key: 'unreachableLast', tone: 'bad' });
  });

  it('a last check can never turn "not saved" into "connected" (keys replaced, then a stale status)', () => {
    expect(keysState({ saved: false, lastCheck: { at, ok: true, reason: null } }).key).toBe('notConnected');
  });

  it('the form is offered only when the server can keep keys AND the session may write; the saved fields are shown either way', () => {
    expect(mayEditKeys({ keysSetUp: true }, true)).toBe(true);
    expect(mayEditKeys({ keysSetUp: false }, true)).toBe(false);
    expect(mayEditKeys({ keysSetUp: true }, false)).toBe(false);
    // The list of saved fields is not behind `mayEdit`: keys saved before the server lost its key are still saved.
    expect(keys.indexOf('stc-set')).toBeGreaterThan(keys.indexOf('open && mayEdit ?'));
    expect(keys).toContain("{!conn.keysSetUp ? <p className=\"stc-warn\">{t('keysNotSetUp')}</p> : null}");
  });

  it('Check is offered whenever keys are saved; with no adapter built a tap says plainly that checking opens later, instead of pretending', () => {
    expect(keys).toContain('{conn.saved ? (');
    expect(keys).not.toMatch(/[&|]{2} \(?(conn\.)?canCheck/);
    expect(keys).toContain("unavailable: t('keysCheckUnavailable'");
    expect(keys).toContain("if (res.result !== 'unavailable') load(true);");
  });

  it('a 503 on save means the server lost its key since the page loaded: the form closes and says so', () => {
    expect(keys).toContain('setConn({ ...conn, keysSetUp: false });');
    expect(keys).toContain("setProblem({ id: 'notSetUp' })");
  });

  it('reads the API’s error CODES for the two failures it has its own words for — never a stack or its English', () => {
    expect(keys).toContain("code === 'not_connected'");
    expect(keys).toContain("code === 'keys_unreadable'");
    // A Check that overlapped a Replace, and a Check after the server lost its key: each has its own words, and the first re-reads.
    expect(keys).toContain("code === 'keys_changed' ? 'checkChanged'");
    expect(keys).toContain("if (code === 'keys_changed') load(true);");
    expect(keys).toContain("code === 'keys_not_set_up'");
  });

  it('shows the field the server objected to, in OUR words (and Hindi), never the server’s English sentence', () => {
    expect(keys).toContain("t('keysFieldRefused'");
    expect(keys).not.toContain('e.message');
    expect(keys).toContain(String.raw`e.field?.replace(/^fields\./, '')`);
  });

  it('holds messages as what happened, not as a sentence, so a language switch re-renders them', () => {
    expect(keys).toContain('const [problem, setProblem] = useState<Problem | null>(null);');
    expect(keys).not.toMatch(/useState\(''\)/);
  });
});

describe('a read that is out of date never lands, and a failed refresh never takes the answer away', () => {
  it('only the newest read may land, and a save bumps the counter so an older read cannot put the old status back', () => {
    expect(keys).toContain('const mine = ++readSeq.current;');
    expect(keys).toContain('if (mine === readSeq.current) setConn(c);');
    expect(keys).toContain('readSeq.current++;');
  });

  it('the refresh after a Check is quiet: a failed read keeps what is on screen instead of turning the section into an error', () => {
    expect(keys).toContain("if (res.result !== 'unavailable') load(true);");
    expect(keys).toContain('if (mine === readSeq.current && !quiet) setLoadFailed(true);');
  });
});

describe('focus and announcements', () => {
  it('moves focus into the first field when the form opens and back to the button that opened it when it closes', () => {
    expect(keys).toContain('if (open) firstField.current?.focus();');
    expect(keys).toContain('else if (wasOpen.current) trigger.current?.focus();');
  });

  it('a busy button keeps focus: aria-disabled, never the disabled attribute, with the click ignored', () => {
    expect(keys).not.toMatch(/(?<![-\w])disabled=\{/);
    expect(keys).toContain("aria-disabled={busy !== null}");
    expect(keys).toContain('onClick={() => busy === null && setOpen(true)}');
  });

  it('has ONE live region that stays mounted (a region that appears already holding its text is often not announced); errors are alerts', () => {
    expect(keys.match(/role="status" aria-live="polite"/g)).toHaveLength(1);
    expect(keys).toContain('role="alert"');
    expect(keys).not.toContain('hidden={');
  });
});

describe('loading, empty and error states', () => {
  it('holds the height of the section while it loads, and offers a retry when it cannot', () => {
    expect(keys).toContain('stc-keys-loading');
    expect(keys).toContain('role="status" aria-busy="true" aria-label={t(\'loading\')}');
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

  it('lets a saved-field row wrap (a larger system text size or a longer Hindi label must not push it past the card), and keeps an empty live region from taking space', () => {
    expect(css).toMatch(/\.stc-set-name,\s*\.stc-set-state\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/);
    expect(css).not.toMatch(/white-space:\s*pre/);
    expect(css).toMatch(/\.stc-live:empty\s*\{[^}]*margin-top:\s*calc\(-1 \* var\(--sp-2\)\)/);
    expect(css).toMatch(/\.stc-btn\[aria-disabled='true'\]/);
  });

  it('uses the deep green for "Connected", which passes contrast; the lighter accent does not at this size', () => {
    expect(css).toMatch(/\.stc-state-ok\s*\{[^}]*color:\s*var\(--accent-deep\)/);
  });
});
