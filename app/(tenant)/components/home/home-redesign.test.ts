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
  const shopCss = code('../../styles/99-shop-home.css');
  const boardCss = code('../../styles/95-token-board.css');

  it('includes Products in Owner and Reception quick links, gated by canSee', () => {
    expect(owner).toContain("{ href: '/products', label: t.nav.products, icon: <IconProducts />, tone: 'blue' }");
    // The front desk sells from the shelf; the catalogue stays the owner's (QA, 2026-10-17 — this asked
    // `canSee('/products', 'receptionist')`, which is always false, so the desk had no tile at all).
    expect(reception).toContain("canSee('/products/sell', 'receptionist')");
    expect(reception).toContain("href: '/products/sell', label: t.sellProductAction, icon: <IconProducts />");
  });

  it('has no Billing tile in the Owner quick links (owner, 2026-10-19) — the bill is still one tap away in Settings', () => {
    expect(owner).not.toContain("'/settings/billing'");
    expect(owner).not.toContain('IconWallet');
    expect(owner).toContain("{ href: '/settings', label: t.nav.settings, icon: <IconSettings />, tone: 'slate' }");
  });

  it('has Sell product in the Owner quick links where Offers was, gated by canSee', () => {
    expect(owner).toContain("{ href: '/products/sell', label: t.sellProductAction, icon: <IconCart />, tone: 'blue' }");
    expect(owner).not.toContain("href: '/offers'");
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

  it('renders the salon desk Home: 3 KPI cards, reception actions, today\'s schedule and staff with what needs attention', () => {
    const bookingsList = code('../../appointments/BookingsList.tsx');
    expect(owner).toContain('className={`rst-desk hm-desktop sln-desk');
    expect(owner).toContain('className="rst-kpis"');
    expect(owner).toContain('className="rst-kpi rst-kpi-sales"');
    expect(owner).toContain('className="rst-actions-grid sln-actions-grid"');
    expect(owner).toContain('className="rst-bottom-grid"');
    expect(owner).toContain('className="sln-team-list"');
    // The old command center is removed, not hidden by CSS.
    expect(owner).not.toContain('hm-desk-v3');
    expect(homeCss + shopCss).not.toContain('is-sln-hidden');
    expect(bookingsList).toContain('className="hm-v3-table bk-table"');
    // What needs attention is still counted from the day, not invented.
    expect(owner).toContain('const overdueGroups = (todayGroups ?? []).filter((g) => countsAsNotMarked(g, now));');
    expect(owner).toContain('const branchAtt = dataIsForBranch ? data?.attention : null;');
    expect(owner).toContain('const svc = tk.serviceNames.length > 0 ? summarizeServices(tk.serviceNames, t.lang) : w.servicesAtPayment;');
    expect(owner).toContain('deskAttention.rows.map');
    // Who has not marked in is the staff list's job; what needs attention no longer repeats it (2026-10-19).
    expect(owner).not.toContain('deskAttention.staffCount');
    expect(owner).not.toContain('unmarkedStaff');
    const clinicEn = homeCopy('en', { appointments: 'Consultations', appointment: 'Consultation', providers: 'Doctors', services: 'Treatments', resource: 'Room' });
    expect(clinicEn.bookingsAttentionChip).toBe('Consultations & queue');
    // The desk is every booking vertical's Home: no salon nouns in its words.
    expect(clinicEn.walkInOrNewBooking).toBe('Walk-in / New consultation');
    expect(clinicEn.todaysDiarySub).toBe('View all consultations');
    expect(clinicEn.quickBillPosSub).toBe('Bill treatments & products');
    expect(clinicEn.teamOnFloorTitle).toBe('Doctors today');
    expect(JSON.stringify(clinicEn)).not.toMatch(/\bchair\b/i);
  });

  it('routes Sell product on Home and Products to the dedicated /products/sell POS screen with product categories', () => {
    const sellPage = code('../../products/sell/page.tsx');
    const sellClient = code('../../products/sell/SellProductClient.tsx');
    const productsList = code('../../products/ProductsList.tsx');
    const payFlow = code('../../appointments/new/PayFlow.tsx');
    const deskGrid = code('../../appointments/new/DeskServiceGrid.tsx');
    expect(owner).toContain("{ href: '/products/sell', label: t.sellProductAction");
    expect(productsList).toContain('href="/products/sell?from=products"');
    // Jira GRW-616 — the page names its address; the screen it hands to holds the guards, for both of its addresses.
    expect(sellPage).toContain('guard="/products/sell"');
    const sellScreen = code('../../products/sell/SellProductScreen.tsx');
    expect(sellScreen).toContain('await guardScreen(guard);');
    expect(sellScreen).toContain('await guardLive(guard);');
    expect(sellClient).toContain('productsOnly');
    expect(payFlow).toContain('<DeskProductCategories');
    expect(deskGrid).toContain("useState<'services' | 'packages' | 'products'>(productsOnly ? 'products' : (initialTab ?? 'services'))");
    // Every React hook in PayFlow must run before the first early return (`step === 'done'`), so transitioning to `done`, `qr`, or `how` never changes hook count.
    const afterFirstReturn = payFlow.slice(payFlow.indexOf("if (step === 'done' && sale)"));
    expect(afterFirstReturn).not.toMatch(/\buse(State|Effect|Memo|Ref|Callback|Translations|Locale)\b/);
  });
});
