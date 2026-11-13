import { getTranslations } from 'next-intl/server';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { resolveBranchState } from '../lib/branch-context';
import { guardScreen } from '../lib/screen-guard';
import { homeCopy } from '../lib/home-copy';
import { serverLang } from '../lib/lang';
import { ProductsList } from './ProductsList';
import { redirect } from 'next/navigation';
import { areasOf } from '../lib/areas';

/**
 * Owner, 2026-10-14 — the shelf: what the till sells that nobody performs.
 *
 * One branch at a time, as Services is (a bottle is on one shelf, GRW-376): the branch in the address, else the
 * main one. The list is the screen; adding and editing is a sheet over it.
 */
export type ProductsSearch = { branch?: string; filter?: string };

/**
 * The shelf screen, asked to guard itself under whichever address it is reached by (Jira GRW-608): `/products` for a
 * business that sells things beside its services, `/stock` for a shop. One implementation, two addresses — the nav
 * policy answers who may open each, so nothing in here asks what kind of business this is.
 */
export async function ProductsScreen({ searchParams, guard }: { searchParams: Promise<ProductsSearch>; guard: '/products' | '/stock' }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen(guard);
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
  /*
   * QA 13 Nov 2026, bug 14 — a business that sells from `/stock` (a shop, a kitchen) has ONE shelf screen, named in its own words (Stock,
   * Menu). `/products` is not in its nav, and typed in it drew the same shelf headed "Products". It goes to that one screen instead.
   */
  if (guard === '/products' && areasOf(me).shop) {
    const q = new URLSearchParams();
    if (params.branch) q.set('branch', params.branch);
    if (params.filter) q.set('filter', params.filter);
    redirect(q.size ? `/stock?${q.toString()}` : '/stock');
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
        <ProductsList
          key={branchId}
          products={products}
          categories={categories}
          branchId={branchId}
          initialFilter={initialFilter}
          heading={guard === '/stock' ? homeCopy(await serverLang(), me.labels).nav.stock : undefined}
          shownBranchName={branch.multi && branch.choice === null ? (branch.branches.find((b) => b.id === branchId)?.name ?? null) : null}
        />
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

