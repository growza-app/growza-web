import { screenTitle } from '../lib/page-title';
import { ProductsScreen, type ProductsSearch } from './ProductsScreen';

export const dynamic = 'force-dynamic';

export default function ProductsPage({ searchParams }: { searchParams: Promise<ProductsSearch> }) {
  return <ProductsScreen searchParams={searchParams} guard="/products" />;
}

export const metadata = screenTitle('Products');
