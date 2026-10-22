import { labelledTitle } from '../lib/page-title';
import { ProductsScreen, type ProductsSearch } from '../products/ProductsScreen';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-608 — a shop's Stock: the shelf, at its own address.
 *
 * The same screen the Products link opens for a business that sells things beside its services — sizes, counts,
 * moving stock between branches, the stock take — because that is what a shop's shelf is, and nothing about it is
 * duplicated. The route is its own so a shop's navigation says what a shop says (Jira GRW-608 BR-04).
 */
export default function StockPage({ searchParams }: { searchParams: Promise<ProductsSearch> }) {
  return <ProductsScreen searchParams={searchParams} guard="/stock" />;
}

// The vertical's own word: Stock to a shop, Menu to a kitchen — the same word the nav and the heading already use.
export const generateMetadata = () => labelledTitle('stock', 'Stock');
