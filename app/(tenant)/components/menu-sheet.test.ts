import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jira GRW-306 — the phone header, the menu button and the account menu.
 *
 * The hamburger used to be one fixed button over every screen: each header had
 * to leave 58px clear for it, two did not (Reports lost the "R" of its title),
 * and the drawer it opened kept 14 links tabbable while off-screen. These pin
 * the pieces that fix that. Checked in a browser at 320–1440px; these are the
 * regressions a screenshot would not be taken to catch.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const allCss = ['../styles/32-customers.css', '../styles/71-attendance-register.css', '../styles/83-role-home.css', '../styles/76-header-controls.css'].map((p) => code(p)).join('\n');

describe('the menu button sits in the header row', () => {
  it('no fixed-position toggle is left to cover a title', () => {
    expect(code('MobileChrome.tsx')).not.toMatch(/menu-toggle|useMobileNav|IconMenu/);
    expect(allCss).not.toMatch(/\.menu-toggle/);
    expect(code('../styles/02-mobile-nav-hamburger-off-canvas-drawer.css')).not.toMatch(/\.menu-toggle/);
  });

  it('no header keeps a 58px hole for a button that floats', () => {
    expect(allCss).not.toMatch(/padding[^;]*max\(58px/);
  });

  it('every header row draws it: PageHeader, Home, and Reports', () => {
    expect(code('PageHeader.tsx')).toMatch(/<MenuButton \/>/);
    expect(code('home/parts.tsx')).toMatch(/<MenuButton \/>/);
    expect(code('../reports/ReportsShell.tsx')).toMatch(/<MenuButton \/>/);
  });

  it('a screen with a Back arrow shows that instead of the menu', () => {
    expect(code('PageHeader.tsx')).toMatch(/\{onBack \? null : <MenuButton \/>\}/);
  });

  it('it says what it opens and whether it is open', () => {
    const button = code('MenuButton.tsx');
    expect(button).toMatch(/aria-expanded=\{open\}/);
    expect(button).toMatch(/aria-controls="site-menu"/);
    expect(code('Sidebar.tsx')).toMatch(/id="site-menu"/);
  });

  it('it is a phone control: display:none from 861px, and a 44px target below', () => {
    const css = code('../styles/76-header-controls.css');
    expect(css).toMatch(/\.menu-btn\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/@media \(max-width: 860px\)\s*\{\s*\.menu-btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
  });
});

describe('the drawer is a real modal', () => {
  const sidebar = code('Sidebar.tsx');

  it('closed, it is visibility:hidden — its links are not tabbable or read out from off-screen', () => {
    expect(code('../styles/32-customers.css')).toMatch(/\.sidebar\s*\{[^}]*visibility:\s*hidden;/);
    expect(code('../styles/32-customers.css')).toMatch(/\.sidebar\[data-open='true'\]\s*\{[^}]*visibility:\s*visible;/);
  });

  it('open, it says so, moves focus in, keeps Tab inside, closes on Escape and hands focus back', () => {
    expect(sidebar).toMatch(/role=\{open \? 'dialog' : undefined\}/);
    expect(sidebar).toMatch(/aria-modal=\{open \? true : undefined\}/);
    expect(sidebar).toMatch(/\.sidebar-close'\)\?\.focus\(\)/);
    expect(sidebar).toMatch(/e\.key !== 'Tab'/);
    expect(sidebar).toMatch(/e\.key === 'Escape'/);
    expect(sidebar).toMatch(/\.menu-btn'\)\?\.focus\(\)/);
  });

  it('its close button is a 44px target', () => {
    expect(code('../styles/32-customers.css')).toMatch(/\.sidebar-close\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
  });

  it('the wrapper that shares its state is back in the layout', () => {
    expect(code('../layout.tsx')).toMatch(/<MobileNavProvider>/);
  });
});

describe('the account menu holds everything about you', () => {
  const menu = code('AccountMenu.tsx');

  it('role, number, language, Change password and Sign out', () => {
    expect(menu).toMatch(/acct-role/);
    expect(menu).toMatch(/session\.phone/);
    expect(menu).toMatch(/className="acct-lang"/);
    expect(menu).toMatch(/Change password/);
    expect(menu).toMatch(/<SignOutButton className="acct-item acct-signout">/);
  });

  it('language switches between English and Hindi and remembers it', () => {
    expect(menu).toMatch(/chooseLang\('en'\)/);
    expect(menu).toMatch(/chooseLang\('hi'\)/);
    expect(menu).toMatch(/rememberLang\(next\)/);
  });

  it('it is a modal: focus in, Tab kept inside, Escape closes, focus back on the avatar', () => {
    expect(menu).toMatch(/role="dialog" aria-modal="true"/);
    expect(menu).toMatch(/aria-controls=\{open \? dialogId : undefined\}/);
    expect(menu).toMatch(/dialogRef\.current\?\.focus\(\)/);
    expect(menu).toMatch(/e\.key !== 'Tab'/);
    expect(menu).toMatch(/e\.key === 'Escape'/);
    expect(menu).toMatch(/triggerRef\.current\?\.focus\(\)/);
  });
});

describe('Home on a phone', () => {
  const parts = code('home/parts.tsx');
  const hero = code('home/MoneyHero.tsx');
  const owner = code('home/OwnerHome.tsx');

  it('the language switch is no longer a Home header control', () => {
    expect(parts).not.toMatch(/LangToggle|hm-lang/);
    expect(allCss).not.toMatch(/\.hm-lang/);
  });

  it('search stays on the phone, so Home has the same controls as every other screen', () => {
    expect(parts).not.toMatch(/hdr-search hdr-search-wide hm-desktop/);
  });

  it('Today / Week / Month is in the money card on a phone, and on the toolbar from 861px', () => {
    expect(hero).toMatch(/className="hm-seg-hero hm-mobile"/);
    expect(owner).toMatch(/className="hm-desktop"/);
    expect(owner).toMatch(/onPeriod=\{/);
  });

  it('Day summary is an icon beside the branch picker, and still has a name', () => {
    expect(owner).toMatch(/className="hm-toolbar-summary" aria-label=\{t\.daySummary\}/);
  });

  it('the "Day closed" banner is laptop-only — on a phone it cost a whole card of height', () => {
    expect(owner).toMatch(/className="hm-closed hm-desktop"/);
  });

  it('the branch list closes on a tap anywhere else, and on Escape', () => {
    expect(owner).toMatch(/addEventListener\('pointerdown', onPointer\)/);
    expect(owner).toMatch(/!branchRef\.current\?\.contains\(e\.target as Node\)/);
    expect(owner).toMatch(/e\.key !== 'Escape'/);
    expect(owner).toMatch(/<div className="hm-branch" ref=\{branchRef\}>/);
  });

  it('the greeting stays an h1 for a screen reader — visually hidden, not display:none', () => {
    const css = code('../styles/83-role-home.css');
    expect(css).toMatch(/\.hm-head-title\s*\{[^}]*clip:[^}]*\}/);
    expect(css).not.toMatch(/\.hm-head-title,\s*\.hm-head-sub\s*\{\s*display:\s*none/);
  });

  it('pinch-zoom is allowed (WCAG 1.4.4)', () => {
    expect(code('../layout.tsx')).not.toMatch(/maximumScale|maximum-scale|userScalable/);
  });
});
