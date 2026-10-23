import { useLocale, useTranslations } from 'next-intl';

import { useLabels } from '../components/LabelsProvider';
import { nounInSentence, pickNoun } from './nouns';

/**
 * Restaurant QA, 2026-10-24 — the business's own nouns, ready to drop into a message.
 *
 * A kitchen's owner read "Find a client", "Add a product" and "Return product" on screens whose nav already said
 * Guests and Menu: the words were written into the messages instead of coming from the vertical's `labels`. Every
 * message that names who buys or what is sold takes the noun as an argument instead, and this is where the argument
 * comes from — English uses the vertical's word (Guest, Dish, Client, Product), any other language its generic word
 * from `nouns`, as `pickNoun` does everywhere else.
 *
 * `customer` / `product` are the in-sentence forms ("Find a guest"); `Customer` / `Product` are the label as written,
 * for a heading or a column ("Guest", "Dish"). The fallbacks are neutral, never a salon's word: they only show when
 * the layout rendered with no labels at all.
 */
export function useNouns() {
  const locale = useLocale();
  const tn = useTranslations('nouns');
  const labels = useLabels();
  const Customer = pickNoun(locale, labels.customer ?? 'Customer', tn('customer'));
  const Customers = pickNoun(locale, labels.customers ?? 'Customers', tn('customers'));
  const Product = pickNoun(locale, labels.product ?? 'Product', tn('product'));
  const Products = pickNoun(locale, labels.products ?? 'Products', tn('products'));
  const lower = (word: string) => (locale === 'en' ? nounInSentence(word) : word);
  return {
    Customer,
    Customers,
    Product,
    Products,
    customer: lower(Customer),
    customers: lower(Customers),
    product: lower(Product),
    products: lower(Products),
  };
}
