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

  it('renders the 3-row Desktop v3 Command Center with 4 KPI cards, Appointments table + Staff status + Quick actions, and Revenue trend + Top services + Recent activity', () => {
    expect(owner).toContain('className={`hm-desk-v3 hm-desktop');
    expect(owner).toContain('className="hm-v3-kpis"');
    expect(owner).toContain('className="hm-v3-kpi hm-v3-kpi-dark"');
    expect(owner).toContain('className="hm-v3-mid"');
    expect(owner).toContain('className="hm-v3-table"');
    expect(owner).toContain('className="hm-v3-staff-strip"');
    expect(owner).toContain('className="hm-v3-qgrid"');
    expect(owner).toContain('className="hm-v3-bot"');
    expect(owner).toContain('className="hm-v3-bars"');
    expect(owner).toContain('className="hm-v3-srv-rows"');
    expect(owner).toContain('className="hm-v3-feed-rows"');
    expect(homeCss).toMatch(/\.hm-v3-kpis\s*\{/);
    expect(homeCss).toMatch(/\.hm-v3-mid\s*\{/);
    expect(homeCss).toMatch(/\.hm-v3-bot\s*\{/);
  });

  it('routes Sell product on Home directly to the till on the Products tab', () => {
    const newBooking = code('../../appointments/new/NewBookingClient.tsx');
    const payFlow = code('../../appointments/new/PayFlow.tsx');
    const deskGrid = code('../../appointments/new/DeskServiceGrid.tsx');
    expect(owner).toContain('href="/appointments/new?purpose=payment&tab=products"');
    expect(newBooking).toContain("const initialTab = searchParams.get('tab') === 'products' ? 'products' : undefined;");
    expect(payFlow).toContain('initialTab={initialTab}');
    expect(deskGrid).toContain("useState<'services' | 'packages' | 'products'>(initialTab ?? 'services')");
  });
});
