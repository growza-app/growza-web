import { getTranslations } from 'next-intl/server';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { BranchUrlSync } from '../../components/BranchUrlSync';
import { MenuTabs } from '../../components/MenuTabs';
import { loadErrorKind } from '../../lib/load-error';
import { resolveBranchState } from '../../lib/branch-context';
import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';
import { KitchenStockClient } from './KitchenStockClient';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Kitchen stock');

/**
 * Jira GRW-737 — what the kitchen cooks with: raw materials and how much of each is left, one branch at a time (a branch's chicken is its
 * own). Reached from the Menu's second tab. The owner, a manager, the counter and the cook open it; only the owner and a manager change it,
 * and the API leaves every price out for whoever cannot see the money.
 */
export default async function KitchenStockPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await guardScreen('/stock/kitchen');
  const t = await getTranslations('kitchenStock');
  const params = await searchParams;
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
  return (
    <>
      <BranchUrlSync />
      <PageHeader title={t('title')} />
      <div className="page-body ks-page">
        <MenuTabs active="stock" />
        {branch.one ? <KitchenStockClient key={branch.one} branchId={branch.one} /> : <div className="empty">{t('chooseBranch')}</div>}
      </div>
    </>
  );
}
