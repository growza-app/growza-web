import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { receiptRows, rowsToText } from '../../lib/receipt-text';

/**
 * Jira GRW-648 — spending reward points at the till.
 *
 * The arithmetic that matters is the API's, and it is tested there. What only this side can get wrong is the
 * bookkeeping around it: that the lines are sent GROSS (the API nets them itself), that the ways of paying
 * add up to what is actually being collected, and that the client is told what their points did.
 */
const flow = readFileSync(resolve(__dirname, 'PayFlow.tsx'), 'utf8');
const card = readFileSync(resolve(__dirname, '../../components/ClientProfileCard.tsx'), 'utf8');
/** The row itself, shared by the two tills since 2026-10-27 so they cannot word the same balance differently. */
const row = readFileSync(resolve(__dirname, '../../components/RedeemRow.tsx'), 'utf8');
/** And the question behind it, asked once for both of them. */
const quote = readFileSync(resolve(__dirname, '../../lib/use-reward-quote.ts'), 'utf8');
/** The other till. It had no rewards at all until 2026-10-27. */
const sheet = readFileSync(resolve(__dirname, '../../components/NewVisitSheet.tsx'), 'utf8');

describe('what the till asks for', () => {
  it('asks the one route that knows, with the bill, rather than working the offer out itself', () => {
    expect(quote).toMatch(/api\s*\n?\s*\.customerRewards\(clientId, billMinor\)/);
    // Both tills ask through it; neither has an effect of its own.
    expect(flow).toMatch(/useRewardQuote\(fromApp \? null : clientId, totalMinor\)/);
    expect(sheet).toMatch(/useRewardQuote\(rewardClientId, billTotalMinor\)/);
    for (const [name, src] of [['PayFlow', flow], ['NewVisitSheet', sheet]] as const) {
      expect(src, `${name} does not fetch the quote itself`).not.toMatch(/customerRewards\(/);
    }
    /*
     * No second copy of the OFFER anywhere on this screen: what a bill can take is the API's answer, and
     * a till that worked it out again would drift from the rules the owner set.
     *
     * Reading `minRedeemPoints` is allowed from 2026-10-27, and only to subtract: the balance line says
     * "15 more to use them", which is two numbers the API sent, not a rule of its own. `redeemCapBps`
     * stays out — that one IS the rule, and the till is told `minBillMinor` rather than deriving it.
     */
    for (const src of [flow, sheet, row, quote]) expect(src).not.toMatch(/redeemCapBps/);
    for (const src of [flow, sheet, row, quote]) expect(src).not.toMatch(/(const|let)\s+maxRedeemable/);
  });

  it('knows whose points even when it is settling a booking', () => {
    expect(flow).toMatch(/const clientId = client\.kind === 'existing' \? client\.id : \(visit\?\.appointment\.customerId \?\? null\)/);
  });

  it('offers nothing when there is nobody, nothing to spend, or the read failed', () => {
    expect(quote).toMatch(/if \(!clientId \|\| billMinor <= 0\) \{\s*setRewards\(null\);/);
    // Owner, 2026-10-27 — the ANSWER is kept whenever rewards are on, so the balance can be shown; what
    // the bill can take still decides the toggle.
    expect(quote).toMatch(/setRewards\(answer\.enabled \? answer : null\)/);
    expect(quote).toMatch(/if \(!answer\.enabled \|\| answer\.maxRedeemable <= 0\) setUsePoints\(false\)/);
    // A failed read leaves the bill alone: the money is the thing with somebody standing at the counter.
    expect(quote).toMatch(/\.catch\(\(\) => \{[\s\S]{0,400}setRewards\(null\);/);
  });

  /**
   * Owner, 2026-10-27 — "at pos owner should be able to view rewards".
   *
   * The desk could only see a client's points when this bill could spend them, so the question asked at
   * every counter had no answer on the screen. The row shows the balance either way, and when it cannot
   * be spent it names which of the two reasons it is -- too few points, or too small a bill. Those are
   * not the same thing, and the second is the one nobody guesses.
   */
  it('shows what the client has whether or not this bill can spend it', () => {
    // The balance rides along with the offer...
    expect(row).toMatch(/t\('offer', \{ points: rewards\.maxRedeemable \}\)[\s\S]{0,140}\{have\}/);
    // ...and stands alone when there is no offer, with the reason beside it.
    expect(row).toMatch(/shortBy > 0 \? t\('needMore', \{ points: shortBy \}\) : t\('needBill', \{ amount: money\(rewards\.minBillMinor\) \}\)/);
    // Nothing at all for somebody with no points: an empty frame is worse than no frame.
    expect(row).toMatch(/if \(!rewards \|\| \(rewards\.maxRedeemable === 0 && rewards\.balance === 0\)\) return null/);
    // One row, both tills: the counter and the visit sheet render the same component.
    expect(flow).toMatch(/<RedeemRow rewards=\{rewards\}/);
  });

  it('words all three states in both languages', () => {
    for (const lang of [en, hi]) {
      for (const key of ['have', 'needMore', 'needBill'] as const) {
        expect(lang.payFlow.rewards[key], key).toBeTruthy();
      }
    }
    expect(hi.payFlow.rewards.have).toMatch(/[ऀ-ॿ]/);
    expect(hi.payFlow.rewards.needBill).toMatch(/[ऀ-ॿ]/);
  });

  /**
   * Owner, 2026-10-27 — the OTHER till.
   *
   * `NewVisitSheet` takes money on three paths (a waiting token, a counter sale with no stylist, and the
   * checkout that settles a saved walk-in) and had no rewards on any of them: a client could spend their
   * points at the counter and not here, on the same bill, for the same business.
   */
  it('the visit sheet sends the points on every path that takes money', () => {
    const paths = sheet.match(/\.\.\.\(redeemPoints > 0 \? \{ redeemPoints \} : \{\}\),/g) ?? [];
    expect(paths.length, 'one per paying path').toBe(3);
    // The lines go in at their own prices; the server takes the discount off them.
    expect(sheet).not.toMatch(/paidAmountMinor:[^,]*redeemMinor/);
    // What was COLLECTED is the bill less the points, on the tray and on the receipt.
    expect(sheet).toMatch(/const dueMinor = Math\.max\(0, billTotalMinor - redeemMinor\);/);
    expect(sheet).toMatch(/- redeemMinor,/);
    // And what it did to the balance reaches the receipt.
    expect(sheet).toMatch(/rewards: result\.rewards \?\? null,/);
    expect(sheet).toMatch(/rewards: settledRewards,/);
    expect(sheet).toMatch(/balancePoints: paid\.rewards\.balanceAfter/);
  });

  it('does not ask again on every tile tapped', () => {
    expect(quote).toMatch(/setTimeout\(\(\) => \{[\s\S]{0,200}customerRewards/);
    expect(quote).toMatch(/clearTimeout\(timer\)/);
  });
});

describe('what the till sends and collects', () => {
  it('sends the points with the bill at its own prices — the API takes them off the lines', () => {
    expect(flow).toMatch(/const redeemPoints = usePoints && rewards \? rewards\.maxRedeemable : 0;/);
    // Both writes: a booking's checkout and a walk-in's counter sale.
    expect((flow.match(/redeemPoints > 0 \? \{ redeemPoints \} : \{\}/g) ?? []).length).toBe(2);
    // The line amounts are still spread from the BILL, not from what is left after the points.
    expect(flow).toMatch(/const amounts = spread\(baseAmounts\.map\(\(priceMinor\) => \(\{ priceMinor \}\)\), totalMinor\);/);
  });

  it('collects what is left, not what the bill came to', () => {
    expect(flow).toMatch(/const dueMinor = Math\.max\(0, totalMinor - discountMinor\);/);
    for (const used of ['amountMinor: dueMinor', 'dueMinor - firstWay.minor', 'minor >= dueMinor']) {
      expect(flow, `the ways of paying add up to ${used}`).toContain(used);
    }
  });

  it('records what the customer handed over, which is not the legs plus the products any more', () => {
    expect(flow).toMatch(/paidMinor: redeemPoints > 0 \? dueMinor :/);
  });
});

describe('what the client is told', () => {
  it('puts the points on the receipt — used above the total, earned under it', () => {
    const rows = receiptRows(
      {
        businessName: 'Taj Salon',
        branchName: null,
        when: '24 Oct 2026, 5:00 pm',
        tokenNo: null,
        stylist: null,
        singles: [{ name: 'Haircut', amountMinor: 100_000 }],
        pkg: null,
        totalMinor: 90_000,
        rewardPoints: 100,
        rewardMinor: 10_000,
        earnedPoints: 18,
        paidBy: 'Cash',
      },
      {
        title: 'Receipt',
        thanks: 'Thank you',
        services: 'Services',
        token: (n) => `Token ${n}`,
        stylist: (name) => name,
        packageName: (t) => t,
        separately: (was, saved) => `${was} ${saved}`,
        total: (a) => `Total ${a}`,
        saved: (a) => a,
        rewardUsed: (points, amount) => `Reward points used: ${points} (−${amount})`,
        earned: (points) => `You earned ${points} points.`,
        paidBy: (m) => `Paid by ${m}`,
        seeYou: 'See you',
      },
      (minor) => `₹${minor / 100}`,
    );
    const text = rowsToText(rows);
    expect(text).toContain('Haircut — ₹1000');
    expect(text).toContain('Reward points used: 100 (−₹100)');
    expect(text).toContain('*Total ₹900*');
    expect(text).toContain('⭐ You earned 18 points.');
    // The used line sits above the total, where everything else that changed it sits.
    expect(text.indexOf('Reward points used')).toBeLessThan(text.indexOf('Total ₹900'));
  });

  it('says nothing about points on a bill that spent none', () => {
    const rows = receiptRows(
      { businessName: null, branchName: null, when: 'now', tokenNo: null, stylist: null, singles: [{ name: 'Haircut', amountMinor: 100_000 }], pkg: null, totalMinor: 100_000, paidBy: 'Cash' },
      {
        title: 'Receipt', thanks: 'Thanks', services: 'Services', token: (n) => `${n}`, stylist: (s) => s, packageName: (t) => t,
        separately: (w, s) => `${w}${s}`, total: (a) => `Total ${a}`, saved: (a) => a, rewardUsed: () => 'SHOULD NOT APPEAR',
        earned: () => 'NOR THIS', paidBy: (m) => m, seeYou: 'Bye',
      },
      (minor) => `₹${minor / 100}`,
    );
    const text = rowsToText(rows);
    expect(text).not.toContain('SHOULD NOT APPEAR');
    expect(text).not.toContain('NOR THIS');
  });

  it('says it on the done screen too, in the one sentence the desk reads out', () => {
    expect(flow).toMatch(/result\.earnedPoints > 0 \? t\('rewards\.earnedDone', \{ points: result\.earnedPoints \}\) : null/);
  });
});

describe('the balance on a client’s card', () => {
  it('is its own read, and silent when the business has no scheme', () => {
    expect(card).toMatch(/api\s*\n?\s*\.customerRewards\(clientId\)/);
    expect(card).toMatch(/r\.enabled && setRewards\(r\)/);
    // A reward read that fails says nothing: most businesses have no points at all.
    expect(card).toMatch(/\.catch\(\(\) => undefined\)/);
  });

  it('says when the next of them die, which is the line that brings somebody back', () => {
    expect(card).toMatch(/rewards\.expiring && \(/);
    expect(card).toMatch(/c\.pointsExpire\(/);
  });
});

describe('its words', () => {
  it('are there in English and in Hindi, with their placeholders', () => {
    for (const m of [en, hi]) {
      const r = (m as unknown as { payFlow: { rewards: Record<string, string> } }).payFlow.rewards;
      expect(Object.keys(r)).toEqual(expect.arrayContaining(['offer', 'off', 'wasOff', 'receiptUsed', 'receiptEarned', 'earnedDone']));
      expect(r.offer).toMatch(/\{points/);
      expect(r.off).toMatch(/\{amount\}/);
      expect(r.receiptUsed).toMatch(/\{points\}/);
      expect(r.receiptUsed).toMatch(/\{amount\}/);
      const c = (m as unknown as { clientCard: Record<string, string> }).clientCard;
      expect(c.points).toBeTruthy();
      expect(c.pointsExpire).toMatch(/\{on\}/);
    }
  });
});
