import { describe, expect, it } from 'vitest';
import type { Product } from '../lib/api-types';
import { menuShareText, type MenuShareWords } from './menu-share';

const W: MenuShareWords = {
  title: (b) => `${b} — Menu`,
  order: (p) => `Order: ${p}`,
  asOf: (d) => `Prices as of ${d}`,
  half: 'Half',
  full: 'Full',
  other: 'Other',
};
const CATS = [
  { id: 'c1', name: 'Starters' },
  { id: 'c2', name: 'Main course' },
];
const dish = (name: string, rupees: number, categoryId: string | null, extra: Partial<Product> = {}): Product =>
  ({ id: name, name, priceMinor: String(rupees * 100), categoryId, categoryName: null, active: true, stock: 0, sold: 0, ...extra }) as unknown as Product;
const CTX = { businessName: 'Spice Garden', branchName: null, phone: '+919845012345', dateText: '21 Nov 2026' };

describe('the whole menu as one WhatsApp message', () => {
  it('sections in the menu order, dishes A–Z, the frame around them', () => {
    const text = menuShareText([dish('Paneer Tikka', 230, 'c1'), dish('Aloo Gobi', 340, 'c2'), dish('Chicken Tikka', 260, 'c1')], CATS, CTX, W);
    expect(text).toBe(
      [
        '🍽️ *Spice Garden — Menu*',
        '',
        '*Starters*',
        'Chicken Tikka — ₹260',
        'Paneer Tikka — ₹230',
        '',
        '*Main course*',
        'Aloo Gobi — ₹340',
        '',
        '📍 Spice Garden',
        '📞 Order: 98450 12345',
        'Prices as of 21 Nov 2026',
      ].join('\n'),
    );
  });

  it('a Half and a Full of one dish share a line; a lone Half keeps its own name', () => {
    const text = menuShareText(
      [dish('Butter Chicken (Full)', 240, 'c2'), dish('Butter Chicken (Half)', 180, 'c2'), dish('Dal Makhani (Half)', 220, 'c2')],
      CATS,
      CTX,
      W,
    )!;
    expect(text).toContain('Butter Chicken — Half ₹180 · Full ₹240');
    expect(text).toContain('Dal Makhani (Half) — ₹220');
    expect(text).not.toContain('Butter Chicken (Full)');
  });

  it('leaves out taken-off dishes, and says nothing at all when none is on the menu', () => {
    const off = dish('Fish Fry', 280, 'c1', { active: false });
    expect(menuShareText([off, dish('Chicken Tikka', 260, 'c1')], CATS, CTX, W)).not.toContain('Fish Fry');
    expect(menuShareText([off], CATS, CTX, W)).toBeNull();
  });

  it('dishes in no section come last, under Other; no phone means no Order line', () => {
    const text = menuShareText([dish('Water', 20, null), dish('Chicken Tikka', 260, 'c1')], CATS, { ...CTX, phone: null }, W)!;
    expect(text.indexOf('*Other*')).toBeGreaterThan(text.indexOf('*Starters*'));
    expect(text).not.toContain('Order:');
  });

  it('signs with the branch only when it is not the business name', () => {
    expect(menuShareText([dish('Chai', 90, 'c1')], CATS, { ...CTX, branchName: 'Indiranagar' }, W)).toContain('📍 Spice Garden, Indiranagar');
    expect(menuShareText([dish('Chai', 90, 'c1')], CATS, { ...CTX, branchName: 'spice garden' }, W)).toContain('📍 Spice Garden\n');
  });
});
