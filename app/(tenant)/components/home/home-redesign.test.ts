import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';

const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const code = (p: string) => here(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('Tenant Home v2 redesign', () => {
  const owner = code('OwnerHome.tsx');
  const reception = code('ReceptionHome.tsx');
  const parts = code('parts.tsx');
  const hero = code('MoneyHero.tsx');
  const homeCss = code('../../styles/83-role-home.css');
  const boardCss = code('../../styles/95-token-board.css');

  it('includes Products in Owner and Reception quick links, gated by canSee', () => {
    expect(owner).toContain("{ href: '/products', label: t.nav.products, icon: <IconProducts />, tone: 'blue' }");
    expect(reception).toContain("canSee('/products', 'receptionist')");
    expect(reception).toContain("href: '/products', label: t.nav.products, icon: <IconProducts />");
  });

  it('applies .is-clear to zero-count attention rows and tiles so calm states do not look like alerts', () => {
    expect(parts).toContain('className={`hm-att hm-tone-${a.tone}${a.count === 0 ? \' is-clear\' : \'\'}`}');
    expect(reception).toContain('className={`hm-att-tile hm-tone-${a.tone}${a.count === 0 ? \' is-clear\' : \'\'}`}');
    expect(homeCss).toMatch(/\.hm-att\.is-clear\s*\{/);
    expect(homeCss).toMatch(/\.hm-att-tile\.is-clear\s*\{/);
  });

  it('links Needs your attention to Reports ("What to do") with bilingual copy', () => {
    const en = homeCopy('en');
    const hi = homeCopy('hi');
    expect(en.whatToDoLink).toBe('What to do');
    expect(hi.whatToDoLink).toBe('क्या करें');
    expect(en.allClear).toBe('All clear');
    expect(hi.allClear).toBe('सब ठीक है');
    expect(owner).toContain("canSee('/reports', p.role, p.reportTabs)");
    expect(owner).toContain('{t.whatToDoLink} ›');
  });

  it('renders proportional share bars on client retention segment cards via --seg-pct', () => {
    expect(parts).toContain("'--seg-pct': `${share}%`");
    expect(homeCss).toMatch(/\.hm-seg-card::after\s*\{[^}]*width:\s*var\(--seg-pct,\s*0%\)/);
  });

  it('renders a sparkline area polygon beneath the week polyline in MoneyHero', () => {
    expect(hero).toContain('<polygon className="hm-spark-area" points={areaPoints} />');
    expect(homeCss).toMatch(/\.hm-spark-area\s*\{/);
  });

  it('distinguishes Waiting, With stylist, and Paid columns on the desktop TokenBoard with semantic top accents', () => {
    expect(boardCss).toMatch(/\.tb-col\[data-col='waiting'\]\s*\{\s*border-top:\s*3px solid var\(--amber\);/);
    expect(boardCss).toMatch(/\.tb-col\[data-col='with_stylist'\]\s*\{\s*border-top:\s*3px solid var\(--blue\);/);
    expect(boardCss).toMatch(/\.tb-col\[data-col='paid'\]\s*\{\s*border-top:\s*3px solid var\(--accent\);/);
  });

  it('renders the Desktop CRM Command Center with 4 shaded KPI Ribbon cards, Team Floor Activity, and Workspace Launchpad', () => {
    expect(owner).toContain('className={`hm-kpi-ribbon hm-desktop');
    expect(owner).toContain('className="hm-kpi-card hm-kpi-emerald"');
    expect(owner).toContain('className="hm-kpi-card hm-kpi-blue"');
    expect(owner).toContain('className="hm-kpi-card hm-kpi-violet"');
    expect(owner).toContain('className="hm-kpi-card hm-kpi-amber"');
    expect(owner).toContain('className={`hm-crm-bottom hm-desktop');
    expect(owner).toContain('className="hm-card-team"');
    expect(owner).toContain('className="hm-card-launchpad"');
    expect(homeCss).toMatch(/\.hm-kpi-ribbon\s*\{/);
    expect(homeCss).toMatch(/\.hm-crm-bottom\s*\{/);
  });
});
