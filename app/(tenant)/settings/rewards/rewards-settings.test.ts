import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { SETTINGS_GROUPS } from '../nav-data';
import { wholeBusiness } from '../../lib/branch-routes';
import { bpsOf, pointsFor } from './RewardsForm';

/**
 * Jira GRW-648 — Settings › Reward points.
 *
 * What is worth pinning here is what a later edit would undo without noticing: that the screen belongs to the
 * owner and to the whole business, that the rate an owner types means what the engine will do with it, and
 * that the two numbers only exist for a business that has switched the scheme on.
 */
const form = readFileSync(resolve(__dirname, 'RewardsForm.tsx'), 'utf8');
const page = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('where it lives', () => {
  it('is the whole business’s, not a branch’s: points earned at one branch are spendable at another', () => {
    const row = SETTINGS_GROUPS.find((g) => g.key === 'business')!.rows.find((r) => r.href === '/settings/rewards');
    expect(row, 'the Reward points row belongs to the business group').toBeTruthy();
    expect(wholeBusiness('/settings/rewards')).toBe(true);
  });

  it('is the owner’s alone, on the row and at the page', () => {
    const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find((r) => r.href === '/settings/rewards')!;
    expect(row.ownerOnly).toBe(true);
    // The API refuses a role outright (both routes are `owner` in shared's table); this only saves them the trip.
    expect(page).toMatch(/me\?\.member && me\.member\.role !== 'owner'/);
    expect(page).toMatch(/redirect\('\/settings'\)/);
  });
});

describe('the rate an owner types', () => {
  it('is a percent on screen and basis points underneath', () => {
    expect(bpsOf('2')).toBe(200);
    expect(bpsOf('2.5')).toBe(250);
    expect(bpsOf('0')).toBe(0);
    expect(bpsOf('10')).toBe(1_000);
  });

  it('refuses what is not a rate, rather than sending NaN to the API', () => {
    for (const bad of ['', ' ', 'two', '2.555', '-1', '1e3', '٢']) expect(bpsOf(bad)).toBeNull();
  });

  /**
   * The worked example under the field is the only thing on the screen that says what the number MEANS, so it
   * has to agree with the engine to the point. `pointsEarned` floors twice: the bill's basis points to paise,
   * then paise to points at what a point is worth.
   */
  it('shows what one ordinary bill really earns, floored the way the engine floors it', () => {
    expect(pointsFor(100_000, 200, 100)).toBe(20); // ₹1,000 at 2% → ₹20 → 20 points
    expect(pointsFor(100_000, 250, 100)).toBe(25);
    expect(pointsFor(14_900, 200, 100)).toBe(2); // 2% of ₹149 is ₹2.98 — two points, never three
    expect(pointsFor(4_900, 200, 100)).toBe(0); // under a point earns nothing
    expect(pointsFor(100_000, 200, 1_000)).toBe(2); // a ₹10 point: a tenth of the points
  });
});

describe('what the screen offers', () => {
  it('asks the two numbers only of a business that is doing this at all', () => {
    // One `{enabled && (` block: the rate and the expiry are inside it, so an owner with the scheme off sees a
    // switch and nothing else to think about.
    expect(form).toMatch(/\{enabled && \(/);
    expect(form.indexOf("t('rateLabel')")).toBeGreaterThan(form.indexOf('{enabled && ('));
    expect(form.indexOf("t('expiryLabel')")).toBeGreaterThan(form.indexOf('{enabled && ('));
  });

  it('saves the lot at once — a switch that saved itself would start a rate its owner was still typing', () => {
    expect(form).toMatch(/<SettingsSaveBar/);
    expect(form).toMatch(/api\.saveRewardSettings\(\{ enabled, earnBps: bps \?\? initial\.earnBps, expiryDays: days, holdHours: Number\(holdHours\) \}\)/);
    // And closes, like every other full-page settings form (GRW-556 follow-up).
    expect(form).toMatch(/useCloseAfterSave\('\/settings'\)/);
  });

  it('says why rather than greying out, when there is nothing to offer', () => {
    expect(form).toMatch(/if \(!initial\.available \|\| !initial\.changeable\)/);
    expect(form).toMatch(/initial\.available \? t\('noSubscription'\) : t\('notAvailable'\)/);
  });

  it('never offers a rate or an expiry the platform would clamp', () => {
    expect(form).toMatch(/bps > initial\.maxEarnBps/);
    expect(form).toMatch(/c\.days <= initial\.maxExpiryDays/);
  });

  it('offers "Never", because 0 is how the engine already reads it', () => {
    expect(form).toMatch(/<option value=\{0\}>\{t\('expiry\.never'\)\}<\/option>/);
  });
});

describe('its words', () => {
  it('are there in English and in Hindi', () => {
    for (const m of [en, hi]) {
      const r = (m as unknown as { settingsRewards: Record<string, unknown> }).settingsRewards;
      expect(Object.keys(r)).toEqual(expect.arrayContaining(['intro', 'switchLabel', 'rateLabel', 'expiryLabel', 'tillRule', 'save']));
      const hub = (m as unknown as { settingsHub: { rows: Record<string, unknown> } }).settingsHub.rows;
      expect(hub.rewards).toBeTruthy();
    }
  });

  it('keeps the placeholders a translator must keep', () => {
    for (const m of [en, hi]) {
      const r = (m as unknown as { settingsRewards: Record<string, string> }).settingsRewards;
      expect(r.rateHint).toMatch(/\{bill\}/);
      expect(r.rateHint).toMatch(/\{points\}/);
      expect(r.rateHint).toMatch(/\{off\}/);
      expect(r.rateMax).toMatch(/\{max\}/);
      expect(r.tillRule).toMatch(/\{cap\}/);
      expect(r.tillRule).toMatch(/\{floor\}/);
      expect(r.tillRule).toMatch(/\{worth\}/);
    }
  });
});

/**
 * Owner, 2026-10-25 — the rule, where the rule is set.
 *
 * Every number on this screen is one part of a single rule, and an owner reading them one at a time cannot
 * see it: a rate that means nothing without the point's worth, an expiry that decides which points go first,
 * a cap that lives at the till and is not set here at all. The tips are where that rule is written down, in
 * the only place somebody is already thinking about it.
 *
 * Held here because copy is exactly what a later edit drops silently — a tip whose words are gone renders a
 * button that opens an empty bubble.
 */
describe('the rule, in the info tips', () => {
  // QA 2026-10-27 — five, since the hold (loophole L3) is a rule an owner cannot work out from the field.
  const TIPS = ['how', 'earning', 'expiry', 'hold', 'spending'] as const;

  it('is offered on the switch, the rate, the expiry, the hold and the till line', () => {
    for (const tip of TIPS) expect(form).toContain(`{t('tips.${tip}')}`);
    // One bubble per thing that has a rule — not one giant one on the heading.
    expect(form.match(/<InfoTip/g) ?? []).toHaveLength(TIPS.length);
  });

  it('names what each one explains, so a screen reader announces more than "info"', () => {
    for (const key of ['switchLabel', 'rateLabel', 'expiryLabel', 'holdLabel', 'tillLabel'] as const) {
      expect(form).toContain(`<InfoTip ask="infoTipHow" label={t('${key}')}>`);
    }
  });

  it('asks how it works, not what it counts — nothing on this screen counts anything', () => {
    // Reports' own wording turns into "How does What a bill earns work?" here, which is not a sentence.
    expect(form).not.toMatch(/<InfoTip(?! ask="infoTipHow")/);
    for (const messages of [en, hi]) {
      const chrome = messages.chrome as unknown as { infoTipHow: string };
      expect(chrome.infoTipHow).toContain('{label}');
    }
  });

  for (const [lang, messages] of [['English', en], ['Hindi', hi]] as const) {
    it(`has ${lang} words for every one of them, and a label for the till line`, () => {
      const rewards = messages.settingsRewards as unknown as { tips: Record<string, string>; tillLabel: string };
      expect(rewards.tillLabel.length).toBeGreaterThan(0);
      for (const tip of TIPS) {
        expect({ tip, long: (rewards.tips[tip] ?? '').length > 60 }).toEqual({ tip, long: true });
      }
    });
  }

  it('says the things an owner cannot work out from the fields', () => {
    const tips = (en.settingsRewards as unknown as { tips: Record<string, string> }).tips;
    // Earned on what was really paid, and rounded down — neither is visible anywhere on the screen.
    expect(tips.earning).toMatch(/discount/i);
    expect(tips.earning).toMatch(/rounded down/i);
    // Oldest first is the whole reason each bill keeps its own date.
    expect(tips.expiry).toMatch(/oldest/i);
    // What a return and a correction do to points is decided two screens away and nowhere else written down.
    expect(tips.spending).toMatch(/comes? back/i);
    expect(tips.spending).toMatch(/fix|correct/i);
  });

  /**
   * Owner, 2026-10-25 — and it is said SIMPLY.
   *
   * The first draft of these explained the scheme correctly in sentences of twenty-odd words with a dash in
   * the middle of each, and the owner sent it back twice. The people reading this screen may not read English
   * confidently; a true sentence they give up on is worth nothing.
   *
   * So the rule is a rule, not a hope: short sentences, and none of the punctuation that joins two thoughts
   * into one. A writer who needs a longer thought writes two sentences.
   */
  it('is written plainly — short sentences, and no clause stitched onto another', () => {
    const tips = (en.settingsRewards as unknown as { tips: Record<string, string> }).tips;
    for (const [name, text] of Object.entries(tips)) {
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      const longest = Math.max(...sentences.map((s) => s.split(/\s+/).length));
      expect({ name, longest: longest <= 14 }).toEqual({ name, longest: true });
      expect({ name, joined: /[—;:]/.test(text) }).toEqual({ name, joined: false });
      // Four or more sentences means the thought really was broken up, not just punctuated differently.
      expect({ name, enough: sentences.length >= 4 }).toEqual({ name, enough: true });
    }
  });
});
