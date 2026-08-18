import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { OffersManager } from './OffersManager';

export const dynamic = 'force-dynamic';

export default async function OffersPage() {
  let offers;
  try {
    offers = await api.offers();
  } catch {
    return (
      <>
        <PageHeader title="Offers" />
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
        title="Offers"
        subtitle="What customers see today — on the dashboard and in the WhatsApp chat's Offers menu. No discounts are applied automatically; this is just what you tell customers."
      />
      <div className="page-body">
        <OffersManager offers={offers} />
      </div>
    </>
  );
}
