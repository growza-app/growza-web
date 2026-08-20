import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { OffersList } from './OffersList';

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
        subtitle="What customers see today — on the dashboard and in the WhatsApp chat's Offers menu. Plain offers are just wording; combos also carry a price and can be booked directly from WhatsApp."
      />
      <div className="page-body">
        <OffersList offers={offers} services={services} />
      </div>
    </>
  );
}
