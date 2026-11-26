import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_FACES, AVATAR_KEYS, cartoonFor, isAvatarKey } from './ClientCartoon';

const code = (p: string) =>
  readFileSync(resolve(__dirname, p), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

/** Owner, 2026-11-26 — "2 male and 2 female with different skin tone", "save it on the account". */
describe('a person picks their own picture', () => {
  it('offers two men and two women, each a different skin tone', () => {
    expect([...AVATAR_KEYS]).toEqual(['man-1', 'man-2', 'woman-1', 'woman-2']);
    const skins = AVATAR_KEYS.map((k) => AVATAR_FACES[k].skin);
    expect(new Set(skins).size).toBe(4);
    expect(AVATAR_FACES['woman-1'].long || AVATAR_FACES['woman-1'].bun).toBe(true);
    expect(AVATAR_FACES['woman-2'].long || AVATAR_FACES['woman-2'].bun).toBe(true);
  });

  it('an unknown or missing choice is the face drawn from their number, as before', () => {
    expect(isAvatarKey('woman-3')).toBe(false);
    expect(isAvatarKey(null)).toBe(false);
    expect(isAvatarKey('man-2')).toBe(true);
    expect(cartoonFor('+919800079001')).toEqual(cartoonFor('+919800079001'));
  });

  it('is saved on the account through /me/avatar and read back from /me on every screen that draws the person', () => {
    const lang = code('../lib/lang.ts');
    expect(lang).toContain("fetch('/api/v1/me/avatar'");
    const layout = code('../layout.tsx');
    expect(layout).toContain('memberAvatar = me.member?.avatar ?? null;');
    expect(layout).toContain('avatar: memberAvatar,');
    expect(layout).toContain('avatar={memberAvatar}');
    expect(code('Sidebar.tsx')).toContain('choice={avatar}');
    const menu = code('AccountMenu.tsx');
    expect(menu).toContain('<ClientCartoon id={faceId} choice={avatar} className="acct-face" />');
    expect(menu).toMatch(/\[null, \.\.\.AVATAR_KEYS\]/);
    expect(menu).toContain('aria-pressed={avatar === key}');
  });

  it('puts a failed save back and says so', () => {
    const menu = code('AccountMenu.tsx');
    expect(menu).toMatch(/if \(await putAvatar\(next\)\) router\.refresh\(\);\s*else \{\s*setPicked\(undefined\);\s*setPictureError\(true\);/);
  });

  it('names every choice in English and Hindi', () => {
    for (const lang of ['en', 'hi']) {
      const acct = JSON.parse(readFileSync(resolve(__dirname, `../../../messages/${lang}.json`), 'utf8')).chrome.account;
      for (const k of ['yourPicture', 'pictureAuto', 'pictureFailed']) expect(acct[k], `${lang} ${k}`).toBeTruthy();
      for (const k of AVATAR_KEYS) expect(acct.picture[k], `${lang} picture.${k}`).toBeTruthy();
    }
  });
});
