import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { WriteOnly } from '../components/WriteOnly';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { loadAtBranch } from '../lib/branch-load';
import { BranchUrlSync } from '../components/BranchUrlSync';
import { guardScreen } from '../lib/screen-guard';
import { IconPlus } from '../components/icons';
import { PackagesList } from './PackagesList';
import { isPackage } from './packages-logic';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-438 — packages, on their own screen.
 *
 * They were listed on Offers beside announcements, which are a different thing with a different job: an
 * announcement is a line of text with a date window, a package is a priced bundle that is booked, allocated,
 * checked out and reported on. Splitting the screens does not split the data — a package is still the
 * `offer` row that carries a price for its services, which is what `isPackage` asks.
 */
export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  // Jira GRW-409 — a role the nav does not offer this screen lands on Home, not on controls that answer 403.
  await guardScreen('/packages');
  const t = await getTranslations('packages');
  const params = await searchParams;

  let packages, services;
  /**
   * Jira GRW-158 · GRW-165 — the subtitle does not promise what nothing can send yet. A package IS the thing
   * a customer books in chat, so the confident wording is kept and made conditional rather than deleted.
   */
  let whatsappLive = false;
  try {
    // Jira GRW-395 — the header's branch; on "All", every branch's. Loaded alongside the menu, not after it.
    const [loaded, sv] = await Promise.all([
      loadAtBranch(params.branch, api.me().catch(() => null), (branch) => api.offers(branch)),
      api.services(),
    ]);
    packages = loaded.data.filter(isPackage);
    services = sv;
    whatsappLive = loaded.me?.whatsapp?.booking ?? false;
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
      <PageHeader
        title={t('title')}
        subtitle={whatsappLive ? t('subtitleLive') : t('subtitleCrmOnly')}
        actions={
          // Jira GRW-556 (follow-up) — the builder only saves; a suspended business builds nothing.
          <WriteOnly>
            <Link className="btn" href="/packages/new">
              <IconPlus /> {t('build')}
            </Link>
          </WriteOnly>
        }
      />
      <div className="page-body page-fit pkg-page">
        <PackagesList packages={packages} services={services} />
      </div>
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Packages');
