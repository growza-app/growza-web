'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, type Offer, type Provider, type QueueEntry, type Service } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { IconArrowLeft, IconClose } from '../icons';
import { Avatar } from './parts';
import { useDialog } from '../../../shared/a11y/useDialog';

/**
 * Jira GRW-222 — "Give to staff": the one tap that starts a queued walk-in.
 *
 * Busy is "has an unpaid visit in the chair", passed in from the Home that
 * already worked it out — not "has a booking whose time is now". That is the
 * owner's upsell case: a beard trim booked for 15 minutes that became a facial
 * and a haircut keeps its stylist busy until it is paid, and offering that
 * stylist the next walk-in would be the mistake this sheet exists to avoid.
 *
 * Two short steps, the second only when it is needed. The first is just the stylists, by name: tap one and a token
 * that already has its services is given at once. A token issued by name alone has none, and the server will not
 * book a stylist's time without them, so the second step asks — services or a package — and gives. (Owner, 2026-10-05:
 * "very simple: the stylist's name, services or packages.")
 *
 * A busy stylist can still be chosen. The desk knows things the screen does
 * not (they are finishing up, the client is paying now), and refusing would
 * send the receptionist around the app to do what they meant.
 */
export function GiveToStaffSheet({
  t,
  entry,
  providers,
  busy,
  onClose,
  onRecordPayment,
}: {
  t: HomeCopy;
  entry: QueueEntry;
  providers: Provider[];
  /** providerId → who is in their chair and for how long. */
  busy: Map<string, { client: string; min: number }>;
  onClose: () => void;
  /**
   * Jira GRW-489 — the third thing a waiting token can be: paid where it stands.
   *
   * Only passed where the row that opened this sheet has no Record payment button of its own.
   * The desk's board puts it on the row, so there it would be the same action twice in one
   * glance; Bookings opens the whole token with one tap, so there it belongs in here. Handing it
   * UP rather than opening the till from inside keeps one sheet on screen at a time — the parent
   * closes this one and opens that one.
   */
  onRecordPayment?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose });
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Jira GRW-284 — a token issued by name alone has no services, and a visit
   * cannot start without them. Asked here, at the one moment it matters, rather
   * than sending the desk back to re-add the client.
   */
  const needsServices = entry.serviceIds.length === 0;
  /** Jira GRW-451 — `null` is "still loading", which an empty branch menu is not. */
  const [services, setServices] = useState<Service[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  /** The stylist tapped, while the services are still to be asked; null is the first step. */
  const [chosen, setChosen] = useState<Provider | null>(null);
  /** Packages that fill in their services in one tap; none is fine, they are only a shortcut. */
  const [packages, setPackages] = useState<Offer[]>([]);
  useEffect(() => {
    if (!needsServices) return;
    let cancelled = false;
    void api
      .offers(entry.locationId)
      .then((all) => {
        if (!cancelled) setPackages(all.filter((o) => o.active && o.comboPriceMinor !== null && o.serviceIds.length > 0));
      })
      .catch(() => undefined);
    void api
      // Jira GRW-379 — what is sold at the branch they are waiting at.
      .services(entry.locationId)
      .then((all) => {
        if (!cancelled) setServices(all);
      })
      .catch(() => {
        // Jira GRW-451 — an empty list, not a permanent spinner: the sentence below is the honest answer
        // either way, and the old comment ("giving then answers with the API's own 'pick what they are
        // having'") was wrong — `give` refuses locally before the request is ever made.
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [needsServices, entry.locationId]);

  // Free first, then busy, each keeping the roster's own order. Jira GRW-379 — only the branch they wait at:
  // anyone else is refused (GRW-244), so they are not offered.
  const ordered = providers
    .filter((p) => !entry.locationId || !p.locationId || p.locationId === entry.locationId)
    .sort((a, b) => Number(busy.has(a.id)) - Number(busy.has(b.id)));

  const give = async (providerId: string) => {
    if (needsServices && picked.length === 0) {
      setError(t.pickServiceFirst);
      return;
    }
    setSaving(providerId);
    setError(null);
    try {
      await api.giveToStaff(entry.id, providerId, needsServices ? picked : undefined);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.couldNotGive);
      setSaving(null);
    }
  };

  /** First step: a token with services goes straight to the stylist; one without asks for them next. */
  const choose = (p: Provider) => {
    if (needsServices) {
      setChosen(p);
      setError(null);
    } else {
      void give(p.id);
    }
  };

  /** A package is its services: tap to add them all, tap again to take them off. A package whose services the branch lacks is not offered. */
  const togglePackage = (o: Offer) => {
    const all = o.serviceIds.every((id) => picked.includes(id));
    setPicked((cur) => (all ? cur.filter((id) => !o.serviceIds.includes(id)) : [...new Set([...cur, ...o.serviceIds])]));
    setError(null);
  };
  const offeredPackages = packages.filter((o) => (services ?? []).length > 0 && o.serviceIds.every((id) => (services ?? []).some((sv) => sv.id === id)));

  const left = async () => {
    setSaving('left');
    try {
      await api.queueEntryLeft(entry.id);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.couldNotGive);
      setSaving(null);
    }
  };

  const second = needsServices && chosen !== null;

  return (
    <div className="hm-overlay" role="presentation" onClick={onClose}>
      <div className="hm-sheet hm-sheet-narrow" role="dialog" aria-modal="true" aria-labelledby="hm-give-title" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          {second ? (
            <button type="button" className="hm-icon-btn" aria-label={t.changeStylist} disabled={saving !== null} onClick={() => setChosen(null)}>
              <IconArrowLeft />
            </button>
          ) : null}
          <div className="hm-give-title">
            <h2 id="hm-give-title">{second ? t.whatHaving : t.giveTitle(entry.customerName)}</h2>
            <p>
              {second
                ? `${chosen.displayName} · ${entry.customerName}`
                : [entry.tokenNo ? `#${entry.tokenNo}` : null, entry.serviceNames.join(' + ')].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" className="hm-icon-btn" aria-label={t.close} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {error ? <div className="hm-error" role="alert">{error}</div> : null}
        {second ? (
          <>
            <div className="hm-give-services">
              {/* Jira GRW-451 — a branch whose menu is empty says so, rather than a blank row above a button that cannot work. */}
              {services === null ? <p className="hm-empty">{t.loadingServicesHere}</p> : null}
              {services !== null && services.length === 0 ? <p className="hm-empty">{t.noServicesHere}</p> : null}
              {offeredPackages.length > 0 ? (
                <>
                  <div className="wi-section-label">{t.packagesLabel}</div>
                  <div className="wi-chips">
                    {offeredPackages.map((o) => {
                      const on = o.serviceIds.every((id) => picked.includes(id));
                      return (
                        <button key={o.id} type="button" className={`wi-chip ${on ? 'wi-chip-on' : ''}`} aria-pressed={on} onClick={() => togglePackage(o)}>
                          {o.title}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
              {(services ?? []).length > 0 ? <div className="wi-section-label">{t.servicesLabel}</div> : null}
              <div className="wi-chips">
                {(services ?? []).map((sv) => {
                  const on = picked.includes(sv.id);
                  return (
                    <button
                      key={sv.id}
                      type="button"
                      className={`wi-chip ${on ? 'wi-chip-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => {
                        setPicked((cur) => (on ? cur.filter((id) => id !== sv.id) : [...cur, sv.id]));
                        setError(null);
                      }}
                    >
                      {sv.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <button type="button" className="btn hm-give-go" disabled={saving !== null || picked.length === 0} onClick={() => void give(chosen.id)}>
              {t.giveToName(chosen.displayName)}
            </button>
          </>
        ) : (
          <ul className="hm-rows hm-pick">
            {ordered.map((p) => {
              const b = busy.get(p.id);
              return (
                <li key={p.id} className="hm-row hm-row-button">
                  <button type="button" disabled={saving !== null} onClick={() => choose(p)}>
                    <Avatar name={p.displayName} id={p.id} size={38} />
                    <span className="hm-row-main">
                      <span className="hm-row-name">{p.displayName}</span>
                    </span>
                    {b ? <span className="hm-pill hm-pill-amber">{t.busyWith(b.client, b.min)}</span> : <span className="hm-pill hm-pill-green">{t.free}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {second ? null : <div className="hm-give-foot hm-sheet-close">
          {onRecordPayment ? (
            <button type="button" className="hm-btn hm-btn-quiet" disabled={saving !== null} onClick={onRecordPayment}>
              {t.recordPayment}
            </button>
          ) : null}
          <button type="button" className="hm-btn hm-btn-quiet" disabled={saving !== null} onClick={() => void left()}>
            {t.theyLeft}
          </button>
        </div>}
      </div>
    </div>
  );
}
