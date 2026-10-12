import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The person's own name on the avatar, in the account menu and in the sidebar — read off the source. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const layout = read('../layout.tsx');
const menu = read('./AccountMenu.tsx');
const sidebar = read('./Sidebar.tsx');

describe('a person’s name', () => {
  it('the avatar letter is the person’s, falling back to the business’s', () => {
    expect(layout).toMatch(/Array\.from\(memberName \?\? tenantName \?\? 'S'\)\[0\]/);
  });

  it('the account menu leads with the name and lets anyone set it', () => {
    expect(menu).toMatch(/acct-name/);
    expect(menu).toContain("t('addName')");
    expect(menu).toContain('putName(value)');
  });

  it('the sidebar leads with the name once there is one', () => {
    expect(sidebar).toMatch(/<strong>\{name \?\? t\.role\[role \?\? 'owner'\]\}<\/strong>/);
  });
});
