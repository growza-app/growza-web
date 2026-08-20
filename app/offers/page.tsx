import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { OffersList } from './OffersList';
import { CreateOfferMenu } from './CreateOfferMenu';

export const dynamic = 'force-dynamic';

export default async function OffersPage() {
  let offers, services;
  try {
    [offers, services] = await Promise.all([api.offers(), api.services()]);
  } catch {
    return (
      <>
        <PageHeader title="Offers & Combos" />
        <div className="page-body">
          <div className="banner">
            <strong>Cannot reach the server.</strong> Ask your developer to start it, or run <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Offers & Combos"
        subtitle="Create offers and combos that customers see on your dashboard and in WhatsApp's Offers menu. Customers can book combos directly from WhatsApp."
        actions={<CreateOfferMenu />}
      />
      <div className="page-body">
        <OffersList offers={offers} services={services} />
      </div>
    </>
  );
}
