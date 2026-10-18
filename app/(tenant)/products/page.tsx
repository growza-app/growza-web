import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { resolveBranchState } from '../lib/branch-context';
import { guardScreen } from '../lib/screen-guard';
import { ProductsList } from './ProductsList';

export const dynamic = 'force-dynamic';

/**
 * Owner, 2026-10-14 — the shelf: what the till sells that nobody performs.
 *
 * One branch at a time, as Services is (a bottle is on one shelf, GRW-376): the branch in the address, else the
 * main one. The list is the screen; adding and editing is a sheet over it.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ branch?: string; filter?: string }> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/products');
  const t = await getTranslations('products');
  const params = await searchParams;
  const initialFilter =
    params.filter === 'inStock' || params.filter === 'low' || params.filter === 'out' || params.filter === 'retired'
      ? params.filter
      : 'all';

  let me: Awaited<ReturnType<typeof api.me>>;
  try {
    me = await api.me();
  } catch (error) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }
  const branch = resolveBranchState({
    branches: me.branches ?? [],
    role: me.member?.role ?? null,
    memberLocationId: me.member?.locationId ?? null,
    wanted: params.branch ?? null,
  });
  const branchId = branch.one;

  let products: Awaited<ReturnType<typeof api.productsAll>> = [];
  let categories: Awaited<ReturnType<typeof api.productCategories>> = [];
  try {
    if (branchId) [products, categories] = await Promise.all([api.productsAll(branchId), api.productCategories(branchId)]);
  } catch (error) {
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  return (
    <>
      <BranchUrlSync />
      {branchId ? (
        <ProductsList key={branchId} products={products} categories={categories} branchId={branchId} initialFilter={initialFilter} />
      ) : (
        <>
          <PageHeader title={t('title')} subtitle={t('subtitle')} />
          <div className="page-body">
            <div className="empty">{t('chooseBranch')}</div>
          </div>
        </>
      )}
    </>
  );
}

export const metadata = screenTitle('Products');
