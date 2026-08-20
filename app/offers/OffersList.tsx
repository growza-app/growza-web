'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, formatMoney, type Offer, type Service } from '../lib/api';

/**
 * Read-only list of offers/combos — creating and editing both happen in the
 * dedicated wizard (`ComboBuilder`, at /offers/new and /offers/[id]/edit).
 * This page only handles what doesn't need the wizard: toggling active,
 * deleting, and the "Applies to" summary for combos.
 */
export function OffersList({ offers, services }: { offers: Offer[]; services: Service[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const serviceNames = (ids: string[]): string =>
    ids.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean).join(' + ');

  const toggleActive = async (offer: Offer) => {
    setBusy(offer.id);
    try {
      await api.updateOffer(offer.id, { active: !offer.active });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const removeOffer = async (offerId: string) => {
    setBusy(offerId);
    try {
      await api.deleteOffer(offerId);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <span>Your offers &amp; combos</span>
        <Link href="/offers/new" className="btn">
          + Create a new combo
        </Link>
      </div>
      {offers.length === 0 ? (
        <div className="empty">No offers yet — create one above.</div>
      ) : (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {offers.map((offer) => (
            <div key={offer.id} className="offer-row">
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 620 }}>{offer.title}</span>
                  <span className={`chip ${offer.active ? 'chip-confirmed' : 'chip-cancelled'}`}>
                    {offer.active ? 'Active' : 'Inactive'}
                  </span>
                  {offer.comboPriceMinor && (
                    <span className="chip chip-new">Combo · {formatMoney(offer.comboPriceMinor)}</span>
                  )}
                </div>
                {offer.description && <div className="muted" style={{ marginTop: 3 }}>{offer.description}</div>}
                {offer.serviceIds.length > 0 && (
                  <div className="muted" style={{ marginTop: 5, fontSize: 13 }}>
                    🎁 Bookable in WhatsApp — applies to: {serviceNames(offer.serviceIds)}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Link href={`/offers/${offer.id}/edit`} className="btn btn-ghost">
                  Edit
                </Link>
                <button className="btn btn-ghost" onClick={() => toggleActive(offer)} disabled={busy === offer.id}>
                  {offer.active ? 'Turn off' : 'Turn on'}
                </button>
                <button className="btn btn-ghost" onClick={() => removeOffer(offer.id)} disabled={busy === offer.id}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
