import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../lib/page-title';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { PackageBuilder } from '../PackageBuilder';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { guardScreen, guardWritable } from '../../lib/screen-guard';
import { BranchUrlSync } from '../../components/BranchUrlSync';

export const dynamic = 'force-dynamic';

export default async function NewPackagePage() {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/packages');
  // Jira GRW-556 (follow-up) — the builder only saves; a suspended business reads its packages and builds none.
  await guardWritable('/packages');
  const t = await getTranslations('packages');
  let services;
  try {
    services = await api.services();
  } catch (error) {
    return (
      <>
        <PageHeader title={t('newTitle')} />
        <div className="page-body">
          <LoadErrorBanner kind={loadErrorKind(error)} />
        </div>
      </>
    );
  }

  return (
    <div className="page-body">
      {/*
        Jira GRW-446 — the branch in the address is the branch this builds for.

        Without this the builder opened on whatever branch was last looked at, whatever the link said: QA
        opened `/packages/new?branch=<Koramangala>` and was offered QA Copy's services at QA Copy's prices,
        with the picker reading QA Copy. Every other screen that takes a branch says so through this component —
        it remembers the one in the address, and puts the remembered one there when the address is silent, so
        the address and the builder can never disagree about what is being priced.
      */}
      <BranchUrlSync />
      <PackageBuilder services={services} />
    </div>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('New package');
