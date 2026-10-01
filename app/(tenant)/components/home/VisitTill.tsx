'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type Appointment, type Offer, type Provider, type Service } from '../../lib/api';
import { useNewVisitCopy } from '../../lib/use-copy';
import { CheckoutSheet } from '../CheckoutSheet';
import { useDialog } from '../../../shared/a11y/useDialog';

/**
 * Jira GRW-403 (epic GRW-283) — Record payment for a visit that is already with a stylist.
 *
 * The till is the existing one (`CheckoutSheet`, GRW-314): services with their amounts, add or take off a line,
 * one payment mode, save. Saving completes the visit, and the token that stands for it reads Paid — the state is
 * derived from the visit (`TOKEN_STATE_SQL`), so nothing here has to tell the token anything.
 *
 * What this adds is finding the visit's REAL rows first, the way Record payment's own till does (`openCheckout` in
 * `NewVisitSheet`): today AND tomorrow, because a late visit's legs can run past local midnight, narrowed to the
 * visit's own legs so an earlier booking of the same client's is never swept in. Only the legs still open are
 * settled; the first is the appointment, the rest ride along as its group.
 */
export function VisitTill({
  legIds,
  customerId,
  locationId,
  timezone,
  onClose,
}: {
  /** Every leg of the visit (`TokenRow.legIds`, or a booking group's rows). */
  legIds: string[];
  /** Narrows the read to this client's rows; the read is the whole day without it. */
  customerId?: string | null;
  /** The visit's branch: its menu is what can be added at the till. */
  locationId?: string | null;
  timezone: string;
  onClose: () => void;
}) {
  const nv = useNewVisitCopy();
  const [loaded, setLoaded] = useState<{ rows: Appointment[]; services: Service[]; providers: Provider[]; offers: Offer[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const waitRef = useRef<HTMLDivElement>(null);
  // The small "opening" / "could not open" panel is a dialog of its own until the till replaces it.
  useDialog(waitRef, { onClose, active: loaded === null });

  useEffect(() => {
    let live = true;
    const zoned = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
    const now = new Date();
    void Promise.all([
      api.appointments(zoned(now), zoned(new Date(now.getTime() + 24 * 60 * 60 * 1000)), undefined, customerId ?? undefined),
      api.services(locationId ?? undefined),
      api.providers(),
      api.offers().catch(() => [] as Offer[]),
    ])
      .then(([all, services, providers, offers]) => {
        if (!live) return;
        const byId = new Map(all.map((a) => [a.id, a]));
        const rows = legIds.map((id) => byId.get(id)).filter((a): a is Appointment => Boolean(a) && a!.status === 'confirmed');
        // Nothing open means it was settled meanwhile (another desk, Bookings); a partial read is refused rather
        // than settling half a visit — the same "every leg, or none" rule as Record payment's till.
        if (rows.length === 0 || legIds.some((id) => !byId.has(id))) {
          setFailed(nv.tillFailed);
          return;
        }
        const visitProviders = providers.filter((p) => !locationId || !p.locationId || p.locationId === locationId);
        setLoaded({ rows, services, providers: visitProviders, offers });
      })
      .catch((error: unknown) => {
        if (live) setFailed(error instanceof ApiError && error.status < 500 && error.code ? error.message : nv.tillFailed);
      });
    return () => {
      live = false;
    };
    // The visit is fixed for the life of this till.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loaded) {
    const [first, ...rest] = loaded.rows;
    return (
      <CheckoutSheet
        appointment={first!}
        groupMembers={rest}
        services={loaded.services}
        providers={loaded.providers}
        offers={loaded.offers}
        timezone={timezone}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="hm-overlay" role="presentation" onClick={onClose}>
      <div
        className="hm-sheet hm-sheet-narrow"
        role="dialog"
        aria-modal="true"
        aria-label={nv.paymentTitle}
        aria-busy={failed === null}
        ref={waitRef}
        onClick={(e) => e.stopPropagation()}
      >
        {failed ? (
          <div className="hm-error" role="alert">
            {failed}
          </div>
        ) : (
          <p className="hm-empty">{nv.openingTill}</p>
        )}
        <button type="button" className="hm-btn hm-btn-quiet hm-sheet-close" onClick={onClose}>
          {nv.close}
        </button>
      </div>
    </div>
  );
}
