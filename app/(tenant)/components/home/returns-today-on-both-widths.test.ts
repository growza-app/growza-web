import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * QA 2026-11-14, F6 — the laptop's Needs attention said "15 Returns" (the last seven days) while the phone's said
 * "Returns today 8". Both now read the API's live count of today's returns.
 */
const home = readFileSync(new URL('./ShopHome.tsx', import.meta.url), 'utf8');

describe('Needs attention counts today’s returns on every width', () => {
  it('the laptop chip and the phone row read the same figure and say the same words', () => {
    const laptop = home.slice(home.indexOf('const attentionChips = ['), home.indexOf('const attentionCount'));
    expect(laptop).toContain('n: data?.cameBackToday ?? totalReturnedOrders,');
    expect(laptop).toContain("label: data?.cameBackToday !== undefined ? s.returnsTodayLabel : s.cameBackLabel,");
    const phone = home.slice(home.indexOf('const phoneAttention = ['), home.indexOf('].filter', home.indexOf('const phoneAttention = [')));
    expect(phone).toContain('n: data?.cameBackToday ??');
    expect(phone).toContain('label: s.returnsTodayLabel,');
  });
});
