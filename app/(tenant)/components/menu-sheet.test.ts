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

  it('Home draws it — every other header wears Back there (Jira GRW-497, below)', () => {
    expect(code('home/parts.tsx')).toMatch(/<MenuButton \/>/);
  });

  it('every screen but Home wears Back where the menu goes, on a phone only (Jira GRW-497)', () => {
    const header = code('PageHeader.tsx');
    expect(header).toMatch(/\{onBack \? null : <BackButton phoneOnly \/>\}/);
    expect(header).not.toMatch(/MenuButton/);
    expect(code('../reports/ReportsShell.tsx')).toMatch(/<BackButton phoneOnly \/>/);
    expect(code('../reports/ReportsShell.tsx')).not.toMatch(/MenuButton/);
    // Home keeps the menu.
    expect(code('home/parts.tsx')).toMatch(/<MenuButton \/>/);
    // A laptop has the sidebar on screen: no Back there.
    expect(code('../styles/76-header-controls.css')).toMatch(/@media \(min-width: 861px\) \{\s*\.topbar \.topbar-back-phone \{\s*display: none;/);
  });

  it('the arrow is 16x16 (1rem) inside its 44px circle (Jira GRW-498)', () => {
    const css = code('../styles/76-header-controls.css');
    expect(css).toMatch(/\.topbar \.topbar-back-phone svg \{\s*width: 1rem;\s*height: 1rem;/);
    expect(css).toMatch(/\.topbar \.topbar-back-phone \{[^}]*width: 44px;[^}]*height: 44px;/);
  });

  it('Back steps through history and goes Home when there is none', () => {
    expect(code('BackButton.tsx')).toMatch(/window\.history\.length > 1 \? router\.back\(\) : router\.push\('\/'\)/);
  });

  it('it says what it opens and whether it is open', () => {
    const button = code('MenuButton.tsx');
    expect(button).toMatch(/aria-expanded=\{open\}/);
    expect(button).toMatch(/aria-controls="site-menu"/);
    expect(code('Sidebar.tsx')).toMatch(/id="site-menu"/);
  });

  it('the title lead takes what the actions leave, so page actions stay on the title row', () => {
    const css = code('../styles/76-header-controls.css');
    // Basis 0 and a small minimum: the wrap decision sees 150px, not the subtitle's full width,
    // and the 96px title minimum leaves Clients / Services / Staff on one row from 360px up.
    expect(css).toMatch(/\.topbar-lead\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*150px;/);
    expect(css).toMatch(/\.topbar-lead \.topbar-title\s*\{[^}]*min-width:\s*96px;/);
    // A long title wraps to two lines beside the 44px button instead of dropping the actions a row.
    expect(css).toMatch(/\.topbar-lead \.topbar-title h1\s*\{[^}]*white-space:\s*normal;/);
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
    expect(menu).toMatch(/t\('changePassword'\)/);
    expect(menu).toMatch(/<SignOutButton className="acct-item acct-signout">/);
  });

  it('language switches between English and Hindi and remembers it', () => {
    expect(menu).toMatch(/chooseLang\('en'\)/);
    expect(menu).toMatch(/chooseLang\('hi'\)/);
    expect(menu).toMatch(/saveLang\(next\)/);
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

  it('Today / Week / Month is on the toolbar row at every width, not in the card', () => {
    // Jira GRW-313 — it sat in the money card on a phone (GRW-306); it is on the toolbar row now, so the card
    // is a row shorter. The branch picker that shared the row is the header's (Jira GRW-395).
    expect(hero).not.toMatch(/Segmented|hm-seg-hero/);
    expect(owner).toMatch(/<div className="hm-toolbar">/);
    expect(owner).not.toMatch(/<Segmented\s+className="hm-desktop"/);
  });

  it('Day summary is an icon on the toolbar row, and still has a name', () => {
    expect(owner).toMatch(/className="hm-toolbar-summary" aria-label=\{t\.daySummary\}/);
  });

  it('the "Day closed" banner is laptop-only — on a phone it cost a whole card of height', () => {
    expect(owner).toMatch(/className="hm-closed hm-desktop"/);
  });

  it('the collapsed search icon is centred in its circle at every width it collapses', () => {
    const header = code('../styles/76-header-controls.css');
    expect(header).toMatch(/@media \(max-width: 860px\)\s*\{[\s\S]*?\.hdr-search-wide\s*\{[^}]*justify-content:\s*center;/);
    // 861–1180px: words hidden, so the pill collapses with them instead of staying 302px wide.
    expect(code('../styles/83-role-home.css')).toMatch(/\.hm-head \.hdr-search-wide\s*\{[^}]*width:\s*44px;[^}]*justify-content:\s*center;/);
  });

  it("the branch list closes on a tap anywhere else, and on Escape (the header's picker since Jira GRW-395)", () => {
    const picker = code('HeaderBranchPicker.tsx');
    expect(picker).toMatch(/addEventListener\('pointerdown', onPointer\)/);
    // Either of the header's two pickers (laptop pill, phone line) is "inside": they share one open state.
    expect(picker).toMatch(/e\.target\.closest\('\.hbp'\)/);
    expect(picker).toMatch(/e\.key !== 'Escape'/);
    expect(owner).not.toMatch(/className="hm-branch"/);
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
