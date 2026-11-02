import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** Owner, 2026-11-02 — "View orders" on a guest's card landed on a tab screen with a menu button and no way back to the guest. */
describe("A guest's orders go Back to the guest", () => {
  const orders = read('orders/OrdersScreen.tsx');
  const header = read('components/PageHeader.tsx');
  const back = read('components/BackButton.tsx');
  const customers = read('customers/page.tsx');
  const client = read('customers/CustomersClient.tsx');

  it('Orders filtered to one guest wears Back, not the menu, and names where it goes', () => {
    expect(orders).toContain('menu={!query.customerId}');
    expect(orders).toContain('backHref={query.customerId ? `/customers?open=${encodeURIComponent(query.customerId)}` : undefined}');
  });

  it('the header lets a real destination win over the menu button, and Back goes there', () => {
    expect(header).toContain('backHref ? <BackButton phoneOnly href={backHref} /> : menu ? <MenuButton />');
    expect(back).toContain('href ? () => router.push(href)');
  });

  it('Guests opens the card for ?open=<id>, as the guest was left', () => {
    expect(customers).toContain('initialOpenClientId={params.open?.trim() || undefined}');
    expect(client).toContain('useState<string | null>(initialOpenClientId ?? null)');
  });

  it('the card close is a 44px target', () => {
    expect(read('styles/65-narrower-viewports.css')).toMatch(/\.cpc-close \{\s*width: 2\.75rem;\s*height: 2\.75rem;/);
  });
});
