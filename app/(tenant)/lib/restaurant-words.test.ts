import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { homeCopy } from './home-copy';
import { nounInSentence } from './nouns';

/**
 * Restaurant QA, 2026-10-24 — a kitchen's owner read "Find a client", "Add a product", "Return product" and
 * "When your salon is open" on screens whose nav said Guests and Menu. Each of those messages now takes the noun
 * from the business's own labels (`use-nouns.ts`), and the salon-only sentences say "business".
 */
const src = (p: string) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');
const tEn = createTranslator({ locale: 'en', messages: en });
const tHi = createTranslator({ locale: 'hi', messages: hi });

const restaurant = { customer: 'Guest', customers: 'Guests', product: 'Dish', products: 'Menu' };
const retail = { customer: 'Customer', customers: 'Customers', product: 'Product', products: 'Products' };
const salon = { customer: 'Client', customers: 'Clients' };
const word = (l: Record<string, string>, k: string) => nounInSentence(l[k]!);

describe('every noun from the business’s own words', () => {
  it('a restaurant reads guests and dishes', () => {
    expect(tEn('search.shopTitle', { customer: word(restaurant, 'customer') })).toBe('Find a guest');
    expect(tEn('products.form.titleAdd', { product: word(restaurant, 'product') })).toBe('Add a dish');
    expect(tEn('products.form.titleEdit', { product: word(restaurant, 'product') })).toBe('Edit dish');
    expect(tEn('sales.returnSheet.title', { product: word(restaurant, 'product') })).toBe('Return dish');
    expect(tEn('sales.returnSheet.colProduct', { product: restaurant.product })).toBe('Dish');
    expect(tEn('products.cols.product', { product: restaurant.product })).toBe('Dish');
    expect(tEn('payFlow.desk.emptyProductBill', { product: word(restaurant, 'product') })).toBe('Tap a dish to start the bill.');
    expect(tEn('pos.shortcutClient', { customer: restaurant.customer })).toBe('Guest');
    expect(tEn('orders.detail.client', { customer: restaurant.customer })).toBe('Guest');
    expect(tEn('customers.colCustomer', { customer: restaurant.customer })).toBe('Guest');
    expect(tEn('customers.segmentsTitle', { noun: 'guests' })).toBe('How your guests are doing');
    expect(tEn('tax.pricesInclude', { customer: word(restaurant, 'customer') })).toContain('so a guest pays');
    expect(homeCopy('en', restaurant).shop.addCustomerAction).toBe('Add guest');
  });

  it('a shop and a salon read what they read before', () => {
    expect(tEn('search.shopTitle', { customer: word(retail, 'customer') })).toBe('Find a customer');
    expect(tEn('products.form.titleAdd', { product: word(retail, 'product') })).toBe('Add a product');
    expect(tEn('sales.returnSheet.title', { product: word(retail, 'product') })).toBe('Return product');
    expect(tEn('payFlow.sellTitle', { product: word(retail, 'product') })).toBe('Sell product');
    expect(homeCopy('en', retail).shop.addCustomerAction).toBe('Add customer');
    expect(tEn('customers.segmentsTitle', { noun: 'clients' })).toBe('How your clients are doing');
    expect(homeCopy('en', salon).clientsDoingTitle).toBe('How your clients are doing');
  });

  it('the salon-only sentences are about any business', () => {
    for (const m of [en, hi]) {
      expect(m.settingsHours.hintBusiness).not.toMatch(/salon|सैलून/i);
      expect(m.settingsHub.subtitle).not.toMatch(/booking|बुकिंग/i);
      expect(m.notifications.empty).not.toMatch(/booking|बुकिंग/i);
      expect(m.products.form.codesHint).not.toMatch(/ARG-100|Products tab|सामान टैब/);
    }
    expect(en.orders.returnReasons.wrong_item).toBe('Wrong item');
  });

  it('Hindi keeps its generic word and gets the same arguments', () => {
    expect(tHi('search.shopTitle', { customer: hi.nouns.customer })).toBe('ग्राहक खोजें');
    expect(tHi('products.form.titleAdd', { product: hi.nouns.product })).toBe('सामान जोड़ें');
    expect(tHi('customers.noneYet', { noun: hi.nouns.customers })).toBe('यहाँ अभी कोई ग्राहक नहीं।');
  });
});

describe('each screen passes the noun, and says only what can be true', () => {
  it('Guests with nothing typed says there are none yet, not that a search matched nothing', () => {
    expect(src('customers/CustomersClient.tsx')).toContain("search.trim() ? t('noMatch', { noun: lower }) : t('noneYet', { noun: lower })");
  });
  it('the return sheet offers "Size did not fit" only on a bill that sold a size, and the code column only when a line has one', () => {
    const sheet = src('sales/ReturnProductSheet.tsx');
    expect(sheet).toContain("c !== 'size' || billHasSizes");
    expect(sheet).toContain('{showCodes ? <th>');
  });
  it('a counter order was taken at the counter, not "placed on Counter"', () => {
    expect(src('orders/[id]/OrderClient.tsx')).toContain("order.channel === 'counter' ? t('detail.placedCounter')");
  });
  it('the menu hides a column of dashes when nothing listed has a SKU', () => {
    expect(src('products/ProductsList.tsx')).toContain('const showSku = shown.some((p) => Boolean(p.sku));');
  });
});
