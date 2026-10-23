import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { homeCopy } from '../../lib/home-copy';
import { phoneWindow } from '../../lib/phone-window';

/**
 * Jira GRW-643 — the shop's phone Home gets a period of its own.
 *
 * The money on it was `shopHome`'s fixed today/yesterday pair, which nothing could move. It now asks
 * `by-channel` for whichever of four windows the owner picked, and draws that window's billed total,
 * order count, comparison and top seller. What this file holds is the two things that make that safe:
 * the window arithmetic (a pure function, tested as one), and the rule that each read runs only on the
 * screen that displays it, so neither Home pays for the other's.
 */
const here = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const shop = here('./ShopHome.tsx');
const css = here('../../styles/99-shop-home.css');

const IST = 'Asia/Kolkata';
/** 2026-10-23 is a Friday. 01:30 UTC is 07:00 IST the SAME day — the zone has to be honoured, not the clock. */
const fridayEarly = new Date('2026-10-23T01:30:00Z');
/** 20:00 UTC on the 23rd is 01:30 IST on the 24th: in IST this is already Saturday. */
const fridayLate = new Date('2026-10-23T20:00:00Z');

describe('the window a period means', () => {
  it('today and this month are range keys of their own, with no custom dates', () => {
    expect(phoneWindow('today', IST, fridayEarly)).toEqual({ range: 'today' });
    expect(phoneWindow('this_month', IST, fridayEarly)).toEqual({ range: 'this_month' });
  });

  it('yesterday is one inclusive day, so from and to are the same date', () => {
    expect(phoneWindow('yesterday', IST, fridayEarly)).toEqual({ range: 'custom', from: '2026-10-22', to: '2026-10-22' });
  });

  it('this week runs Monday to today, not a rolling seven days', () => {
    // Friday the 23rd: Monday the 19th through today. `last_7_days` would have started on the 17th.
    expect(phoneWindow('this_week', IST, fridayEarly)).toEqual({ range: 'custom', from: '2026-10-19', to: '2026-10-23' });
  });

  it('on a Monday the week is that one day, never the week before', () => {
    const monday = new Date('2026-10-19T06:00:00Z');
    expect(phoneWindow('this_week', IST, monday)).toEqual({ range: 'custom', from: '2026-10-19', to: '2026-10-19' });
  });

  it('reads the day in the business zone, not the browser clock', () => {
    // 20:00 UTC is already Saturday the 24th in IST, so "yesterday" is Friday the 23rd — not Thursday.
    expect(phoneWindow('yesterday', IST, fridayLate)).toEqual({ range: 'custom', from: '2026-10-23', to: '2026-10-23' });
    expect(phoneWindow('this_week', IST, fridayLate)).toEqual({ range: 'custom', from: '2026-10-19', to: '2026-10-24' });
  });

  it('a missing or unusable zone still returns a window rather than throwing', () => {
    expect(phoneWindow('today', undefined, fridayEarly)).toEqual({ range: 'today' });
    const junk = phoneWindow('yesterday', 'Not/AZone', fridayEarly);
    expect(junk.range).toBe('custom');
    expect(junk.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(junk.from).toBe(junk.to);
  });
});

describe('each Home pays only for its own reads', () => {
  it('the command center’s five feeds do not run below 861px', () => {
    expect(shop).toContain("const mq = window.matchMedia('(max-width: 860px)');");
    // The same edge `.shp-mobile-stack` is hidden at, so `phone === true` IS "the mobile stack is on screen".
    expect(css).toMatch(/@media \(min-width: 861px\)[\s\S]*\.shp-mobile-stack \{\s*display: none;/);
    expect(shop).toMatch(/if \(phone !== false\) return;\s*\n\s*const mine = \+\+deskReqId\.current;/);
  });

  it('the phone’s reads do not run on a laptop, and neither runs before the viewport is known', () => {
    expect(shop).toMatch(/if \(phone !== true\) return;\s*\n\s*const mine = \+\+phoneReqId\.current;/);
    // `phone` starts null and BOTH guards exclude it, so neither set fires on the first render. A guard
    // of `=== true` on the desk side would have let null through and asked for all five twice per load.
    expect(shop).toContain('const [phone, setPhone] = useState<boolean | null>(null);');
    expect(shop).not.toMatch(/if \(phone === true\) return;/);
  });

  it('the top seller is read for the same window as the money above it', () => {
    const at = shop.indexOf('api\n        .bestSellers({ ...w,');
    expect(at).toBeGreaterThan(0);
    expect(shop.slice(at, at + 200)).toContain('pageSize: 1');
  });

  it('"recent" is the last six orders, not the chosen window', () => {
    const at = shop.indexOf('if (can(\'/orders\')) {\n      api\n        .orders({ pageSize: 6, location: branch })');
    expect(at).toBeGreaterThan(shop.indexOf('if (phone !== true) return;'));
    // It sits ABOVE the `canPhoneRange` gate: the rows are not behind the channel report's permission.
    expect(at).toBeLessThan(shop.indexOf('if (!canPhoneRange) return;'));
  });
});

describe('nothing on the hero is invented, and nothing stale is left under a new label', () => {
  it('the comparison is drawn only when the API says there is a period to compare with', () => {
    expect(shop).toContain('changePct: phoneChannel.previous.hasData ? phoneChannel.totals.changePct : null');
  });

  it('an average over no orders is a dash, never a zero', () => {
    expect(shop).toContain('avgMinor: orders > 0 ? Math.round(takingsMinor / orders) : null');
  });

  it('a window still loading or failed draws its own line, not the previous window’s money', () => {
    expect(shop).toContain("if (!phoneChannel) return { kind: phoneBusy ? ('busy' as const) : ('failed' as const) };");
    expect(shop).toMatch(/phoneFigures\.kind === 'busy' \? \([\s\S]{0,200}shp-hero-skeleton/);
  });

  it('an owner who cannot see the channel report keeps the hero they had: today, and no filter', () => {
    expect(shop).toContain("const canPhoneRange = money && canReports && can('/stock/channels');");
    expect(shop).toMatch(/if \(!canPhoneRange\) \{\s*\n\s*if \(!money \|\| data\?\.today\.takingsMinor === undefined\) return \{ kind: 'none' as const \};/);
    // The filter is offered only to the three kinds it can actually move.
    expect(shop).toContain("{phoneFigures.kind === 'range' || phoneFigures.kind === 'busy' || phoneFigures.kind === 'failed' ? (");
  });

  it('the bars come from the window’s own daily totals, and one selling day is not a trend', () => {
    expect(shop).toContain('if (raw.length < 2) return [];');
    // Two days that SOLD. A month with one busy day drew 22 hairlines and one block.
    expect(shop).toContain('if (max <= 0 || buckets.filter((b) => b.minor > 0).length < 2) return [];');
  });

  it('a window that sold nothing says so in words, not as a row of zeros', () => {
    expect(shop).toMatch(/phoneFigures\.orders === 0 && phoneFigures\.takingsMinor === 0 \? \([\s\S]{0,120}\{s\.noSalesYet\}/);
  });

  it('the billed count and the Orders card’s count are reconciled, not left to contradict', () => {
    // `by-channel` counts what was BILLED; an order returned in full was not, and the Orders card counts it.
    expect(shop).toContain('returnedOrders: phoneChannel.totals.returnedOrders');
    expect(shop).toContain('{s.cameBack(phoneFigures.returnedOrders)}');
  });

  it('the KPI strip stays gone: the average joins the hero’s own stats line instead', () => {
    expect(shop).not.toContain('shp-kpi-strip');
    expect(shop).toContain('{s.avgOrderShort(rupees(phoneFigures.avgMinor))}');
  });
});

describe('the rows and the filter read at 344px, and say nothing by colour alone', () => {
  it('four windows fit as one tap each, on a grid rather than a row that overflows', () => {
    expect(css).toMatch(/\.shp-period \.hm-seg \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.shp-period \.hm-seg button \{[\s\S]*?min-height: 2\.75rem;/);
  });

  it('the order state is a word, and the change carries an arrow and a sign', () => {
    expect(shop).toContain('{stateWord(o.status)}');
    expect(shop).toContain("{phoneFigures.changePct < 0 ? '↓' : '↑'}");
  });

  it('every row is a 44px door', () => {
    expect(css).toMatch(/\.shp-recent-row \{[\s\S]*?min-height: 2\.75rem;/);
    expect(css).toMatch(/button\.shp-hero-pill \{[\s\S]*?min-height: 2\.75rem;/);
  });

  it('money a front desk may not see is left out of the row, not printed as zero', () => {
    expect(shop).toContain('{o.amountMinor === undefined ? null : <span className="shp-recent-amount">{rupees(o.amountMinor)}</span>}');
  });
});

describe('UX-07 — English and Hindi for every new line', () => {
  it('both languages, and Hindi is not English in disguise', () => {
    const en = homeCopy('en').shop;
    const hi = homeCopy('hi').shop;
    for (const key of ['periodToday', 'periodYesterday', 'periodWeek', 'periodMonth', 'periodLabel', 'vsPrevious', 'noSalesYet', 'loadingFigures'] as const) {
      expect(en[key], key).toBeTruthy();
      expect(hi[key], key).toBeTruthy();
      expect(hi[key], key).not.toBe(en[key]);
    }
    expect(en.topSellerPill('Biryani')).toContain('Biryani');
    expect(hi.topSellerPill('बिरयानी')).toContain('बिरयानी');
    expect(hi.topSellerPill('x')).not.toBe(en.topSellerPill('x'));
  });
});
