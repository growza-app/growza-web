import { screenTitle } from '../lib/page-title';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { OffersList } from './OffersList';
import { CreateOfferMenu } from './CreateOfferMenu';
import { getTranslations } from 'next-intl/server';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { loadErrorKind } from '../lib/load-error';
import { loadAtBranch } from '../lib/branch-load';
import { BranchUrlSync } from '../components/BranchUrlSync';

export const dynamic = 'force-dynamic';

export default async function OffersPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const t = await getTranslations('offers');
  const params = await searchParams;
  let offers, services;
  /**
   * Jira GRW-158 · GRW-165 — this page's whole subtitle was a claim about
   * WhatsApp, and it was not true: nothing sends or receives a message yet.
   * Fetched alongside rather than neutered, because "customers book combos
   * straight from WhatsApp" IS the reason to build a combo, and it becomes
   * true the day the switch is flipped.
   */
  let whatsappLive = false;
  try {
    // Jira GRW-395 — the header's branch: its combos and the announcements; on "All", every branch's. Jira GRW-397 —
    // loaded alongside `/me`, not after it.
    const [loaded, sv] = await Promise.all([
      loadAtBranch(params.branch, api.me().catch(() => null), (branch) => api.offers(branch)),
      api.services(),
    ]);
    const me = loaded.me;
    const o = loaded.data;
    offers = o;
    services = sv;
    whatsappLive = me?.whatsapp?.booking ?? false;
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
        actions={<CreateOfferMenu />}
      />
      <div className="page-body page-fit">
        <OffersList offers={offers} services={services} />
      </div>
    </>
  );
}

// Jira GRW-192 — the tab says which screen this is.
export const metadata = screenTitle('Offers');
