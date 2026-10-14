'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Appointment } from '../../lib/api-types';
import type { TokenRow } from '../../lib/home-types';
import { payTokenHref, payVisitHref } from '../../lib/pay-token';
import { useNewVisitCopy } from '../../lib/use-copy';

/** One person who has not paid yet: a token waiting or with a stylist, or a booking still `confirmed`. */
interface Unpaid {
  key: string;
  tokenNo: number | null;
  name: string | null;
  services: string;
  /** What to say beside the name. */
  state: 'waiting' | 'withStylist' | 'booked';
  /** The time to show: when they arrived, or when they were booked for. */
  at: string;
  href: string;
  /** The token or booking this till is already open on. */
  current: boolean;
}

/**
 * Jira GRW-572 — the left panel of the wide till: everyone at this branch today who still has to pay.
 *
 * Tokens first (waiting, then with a stylist), then confirmed bookings that have no token. Tapping one opens
 * the same address the token board and Bookings already use (`payTokenHref` / `payVisitHref`), so the page
 * loads the token or the booking the way it always has and the till fills itself — nothing here invents a
 * second way to load a sale.
 */
export function DeskUnpaid({
  location,
  timezone,
  currentTokenId = null,
  currentVisitId = null,
}: {
  location: string | null;
  timezone: string;
  currentTokenId?: string | null;
  currentVisitId?: string | null;
}) {
  const t = useTranslations('payFlow');
  const nv = useNewVisitCopy();
  const router = useRouter();
  const [rows, setRows] = useState<Unpaid[] | null>(null);

  useEffect(() => {
    let gone = false;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    const clock = new Intl.DateTimeFormat('en-IN', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true });
    const at = (iso: string | null) => (iso ? clock.format(new Date(iso)) : '');
    void Promise.all([
      api.tokensToday(location).catch(() => ({ tokens: [] as TokenRow[] })),
      api.appointments(day, day).catch(() => [] as Appointment[]),
    ]).then(([board, visits]) => {
      if (gone) return;
      const tokens = board.tokens.filter((x) => x.state === 'waiting' || x.state === 'with_stylist');
      const covered = new Set(tokens.flatMap((x) => [x.appointmentId, ...x.legIds]).filter(Boolean));
      const fromTokens: Unpaid[] = tokens
        .filter((x) => x.state === 'waiting' || (x.legIds[0] && x.visitStartAt))
        .map((x) => ({
          key: `t-${x.id}`,
          tokenNo: x.tokenNo,
          name: x.customerName,
          services: x.serviceNames.join(', '),
          state: x.state === 'waiting' ? 'waiting' : 'withStylist',
          at: at(x.visitStartAt ?? x.addedAt),
          href: x.state === 'waiting' ? payTokenHref(x) : payVisitHref({ appointmentId: x.legIds[0]!, startAt: x.visitStartAt! }, timezone),
          current: x.id === currentTokenId || (currentVisitId !== null && x.legIds.includes(currentVisitId)),
        }));
      // A booking is one row however many legs it has: the first leg of each group is the one the address names.
      const seenGroup = new Set<string>();
      const fromBookings: Unpaid[] = [];
      for (const a of visits) {
        if (a.status !== 'confirmed' || covered.has(a.id)) continue;
        if (location && a.locationId && a.locationId !== location) continue;
        if (a.bookingGroupId) {
          if (seenGroup.has(a.bookingGroupId)) continue;
          seenGroup.add(a.bookingGroupId);
        }
        const legs = a.bookingGroupId ? visits.filter((b) => b.bookingGroupId === a.bookingGroupId) : [a];
        fromBookings.push({
          key: `b-${a.id}`,
          tokenNo: null,
          name: a.customerName,
          services: legs.map((l) => l.serviceName).join(', '),
          state: 'booked',
          at: at(a.startAt),
          href: payVisitHref({ appointmentId: a.id, startAt: a.startAt }, timezone),
          current: legs.some((l) => l.id === currentVisitId),
        });
      }
      setRows([...fromTokens, ...fromBookings]);
    });
    return () => {
      gone = true;
    };
  }, [location, timezone, currentTokenId, currentVisitId]);

  return (
    <section className="pf-wide-unpaid" aria-label={t('desk.unpaid')}>
      <h2 className="pf-wide-h">{t('desk.unpaid')}</h2>
      {rows === null ? (
        <p className="pf-wide-empty" aria-busy="true" />
      ) : rows.length === 0 ? (
        <p className="pf-wide-empty">{t('desk.nobodyUnpaid')}</p>
      ) : (
        <ul className="pf-wide-list">
          {rows.map((r) => (
            <li key={r.key}>
              <button type="button" className={`pf-wide-row ${r.current ? 'pf-wide-row-on' : ''}`} aria-current={r.current || undefined} onClick={() => router.push(r.href)}>
                <span className="pf-wide-row-top">
                  <span className="pf-wide-row-name">
                    {r.tokenNo !== null ? `${nv.token(r.tokenNo)} · ` : ''}
                    {r.name ?? nv.noName}
                  </span>
                  <span className="pf-wide-row-at">{r.at}</span>
                </span>
                <span className="pf-wide-row-sub">
                  <span className={`pf-wide-state pf-wide-state-${r.state}`}>{t(`desk.${r.state}`)}</span>
                  {r.services ? ` · ${r.services}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
