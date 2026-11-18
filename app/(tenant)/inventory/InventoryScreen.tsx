import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { loadErrorKind } from '../lib/load-error';
import { resolveBranchState } from '../lib/branch-context';
import { InventoryTabs } from './InventoryTabs';
import { CookTabs } from './CookTabs';
import type { InventoryTab } from './tabs';

/**
 * Jira GRW-741 — the frame every Inventory tab is drawn in: the title, the five tabs (each person sees the ones they may open), and the
 * header's branch. Each tab's page has already asked `guardScreen` for its own address. A tab that works on one branch at a time (Stock, Buy,
 * Suppliers, Recipes) gets that branch, or is asked to choose one; Reports reads the header's branch itself, "all" included.
 */
export async function InventoryScreen({
  tab,
  wanted,
  oneBranch = true,
  children,
}: {
  tab: InventoryTab;
  wanted: string | null;
  oneBranch?: boolean;
  children: (branchId: string | null) => ReactNode;
}) {
  const t = await getTranslations('kitchenStock');
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
    wanted,
  });
  return (
    <>
      <BranchUrlSync />
      <PageHeader title={t('title')} />
      <div className="page-body ks-page inv-page">
        <CookTabs active="inventory" />
        <InventoryTabs active={tab} />
        {!oneBranch ? children(branch.one) : branch.one ? children(branch.one) : <div className="empty">{t('chooseBranch')}</div>}
      </div>
    </>
  );
}
