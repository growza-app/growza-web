'use client';

import { useEffect, useRef, useState } from 'react';

import { api, formatMoney, type ClientProfile, type ClientProfileRow } from '../lib/api';
import { copy } from '../lib/copy';
import { formatPhone } from '../lib/format';
import { IconClose, IconPhone } from './icons';

/**
 * One client's whole story, in a card that opens over the list.
 *
 * Opens from a row on the Clients page and from two places in Reports, and
 * is one component for all three: an owner who taps the same name in two
 * places must not get two different accounts of that person. The figures are
 * derived server-side (`/api/v1/reports/client/:id`) rather than stored, so
 * there is nothing here that can drift out of step with the bookings.
 *
 * It is read-only, deliberately. There is no "Message" button: every
 * proactive send has to go through the compliance funnel with opt-in and an
 * approved template, and a second path to the adapter is lint-forbidden
 * (05-messaging-compliance.md, ADR-11). Call is a `tel:` link, which is the
 * owner's own phone doing the work.
 */
export function ClientProfileCard({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const c = copy.clientCard;

  useEffect(() => {
    let live = true;
    setProfile(null);
    setFailed(false);
    api
      .clientProfile(clientId)
      .then((p) => live && setProfile(p))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [clientId]);

  // Escape closes, like every other overlay in the app. Focus moves into the
  // panel so a keyboard user is not left behind on the row they came from.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Resolve a row to the words an owner reads. Money and dates go through the shared formatters. */
  function render(row: ClientProfileRow): string {
    if (row.value === null || row.value === '') {
      return row.label === 'lastVisit' ? c.neverIn : row.label === 'interval' || row.label === 'nextVisit' ? c.notEnough : '—';
    }
    if (row.kind === 'money') return formatMoney(String(row.value));
    if (row.kind === 'percent') return `${row.value}%`;
    if (row.kind === 'days') {
      const n = Number(row.value);
      if (row.label === 'lastVisit') return c.daysAgo(n);
      // "Due back" is the one row that reads as a direction rather than a
      // duration: the number is how far past their own rhythm they are.
      if (row.label === 'nextVisit') return n > 0 ? c.overdue(n) : n === 0 ? c.dueNow : c.dueIn(-n);
      return c.days(n);
    }
    if (row.label === 'since') {
      // Month and year is the useful grain here — the exact day a client
      // first booked two years ago is noise.
      const d = new Date(String(row.value));
      return Number.isNaN(d.getTime())
        ? String(row.value)
        : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }
    return String(row.value);
  }

  const tone = (row: ClientProfileRow) =>
    row.tone === 'bad' ? 'var(--rp-red)' : row.tone === 'warn' ? 'var(--rp-amber)' : undefined;

  return (
    <>
      <button type="button" className="cpc-scrim" aria-label={c.close} onClick={onClose} />
      <div className="cpc" role="dialog" aria-modal="true" tabIndex={-1} ref={panel}>
        <header className="cpc-head">
          <div className="cpc-head-top">
            <span className="cpc-kicker">{c.kicker}</span>
            <button type="button" className="cpc-close" onClick={onClose} aria-label={c.close}>
              <IconClose />
            </button>
          </div>

          {failed ? (
            <p className="cpc-failed">{c.loadFailed}</p>
          ) : (
            <>
              <div className="cpc-identity">
                <span className="cpc-avatar">{profile?.initial ?? '·'}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="cpc-name">{profile?.name ?? ' '}</div>
                  <div className="cpc-phone">{profile ? formatPhone(profile.phone) : ' '}</div>
                </div>
              </div>
              <div className="cpc-summary">
                <div>
                  <span>{c.totalSpent}</span>
                  <strong>{profile ? formatMoney(String(profile.lifetimeSpendMinor)) : '—'}</strong>
                </div>
                <div>
                  <span>{c.totalVisits}</span>
                  <strong>{profile ? profile.visits : '—'}</strong>
                </div>
              </div>
            </>
          )}
        </header>

        <div className="cpc-body">
          {profile && (
            <>
              <h3 className="cpc-section">{c.insight}</h3>
              {profile.rows.map((row) => (
                <div className="cpc-row" key={row.label}>
                  <span>{c.rows[row.label as keyof typeof c.rows] ?? row.label}</span>
                  <strong style={{ color: tone(row) }}>{render(row)}</strong>
                </div>
              ))}

              {profile.recent.length > 0 && (
                <>
                  <h3 className="cpc-section">{c.recent}</h3>
                  {profile.recent.map((visit) => (
                    <div className="cpc-row" key={visit.whenISO}>
                      <span>
                        {visit.service}
                        <em>{new Date(visit.whenISO).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</em>
                      </span>
                      <strong>{formatMoney(String(visit.amountMinor))}</strong>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <footer className="cpc-foot">
          {/* Disabled with a reason rather than a tel: link to nothing. */}
          <a
            className={`cpc-btn ${profile?.phone ? '' : 'cpc-btn-off'}`}
            href={profile?.phone ? `tel:${profile.phone}` : undefined}
            title={profile?.phone ? undefined : c.noPhone}
          >
            <span className="cpc-btn-icon"><IconPhone /></span>
            {c.call}
          </a>
          {/* By id, not by name in the search box. The search-by-name link
              landed on the Bookings screen's default day — today — so a client
              whose last visit was in July showed nothing at all. */}
          <a
            className={`cpc-btn cpc-btn-primary ${profile ? '' : 'cpc-btn-off'}`}
            href={profile ? `/appointments?customerId=${profile.id}` : undefined}
          >
            {c.viewBookings}
          </a>
        </footer>
      </div>
    </>
  );
}
