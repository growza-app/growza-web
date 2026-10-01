'use client';

import { useMemo, useState } from 'react';
import { type Appointment, type Provider, type TokenBoard as TokenBoardData } from '../../lib/api';
import { clientNameLabel, groupBookings, summarizeServices } from '../../lib/appointment-display';
import { homeCopy } from '../../lib/home-copy';
import type { Lang } from '../../lib/lang';
import { countsAsNotMarked, liveState, minutesBetween } from '../../lib/live-state';
import { IconBan, IconCalendarPlus, IconChevronRight, IconClipboardCheck, IconClock, IconMenu, IconPlus, IconReceipt, IconScissors, IconSearch, IconUserPlus } from '../icons';
import { NewVisitSheet } from '../NewVisitSheet';
import { useBranch } from '../BranchProvider';
import { useMayUse } from '../SessionProvider';
import { BookedToday, bookedNotOnBoard } from './BookedToday';
import { NewTokenSheet } from './NewTokenSheet';
import { TokenBoard } from './TokenBoard';
import { useTokenWords } from './token-words';
import { CardError, HomeHeader, QuickTiles } from './parts';

/**
 * Jira GRW-222 · GRW-404 — the front desk's Home: the day's token board.
 *
 * ## The counter, not a calendar (epic GRW-283)
 *
 * Owner decision 2026-09-26: the desk's Home IS the token board — Waiting · With stylist · Paid — with New token
 * and Record payment first (and New booking beside them). It replaces the Here now card and the Waiting / Later
 * today / Done today tabs, which answered the same three questions from two different sources (the queue, and the
 * clock against the booking list) and could disagree.
 *
 * Everybody served at the counter has a token: a walk-in from New token, Walk-in now and Record payment
 * (GRW-403), and a booked client from "Arrived" (GRW-405). So the board is the room. Bookings made ahead that are
 * not on it yet stay in reach below it, in time order — Booked for today.
 *
 * ## Branches
 *
 * A receptionist with a branch is sent only that branch's tokens by the API. Anyone else sees the branch picked
 * in the header, or every branch when "all" is picked (the tokens carry their branch).
 */

export interface ReceptionHomeProps {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  locationName: string | null;
  timezone: string;
  nowISO: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  appointments: Appointment[] | null;
  /** Jira GRW-404 — the day's tokens. Null when the read failed: that card shows an error, the rest still work. */
  board: TokenBoardData | null;
  providers: Provider[];
}

export function ReceptionHome(p: ReceptionHomeProps) {
  const t = homeCopy(p.lang, p.labels);
  const w = useTokenWords();
  const now = useMemo(() => new Date(p.nowISO), [p.nowISO]);
  const branch = useBranch();
  const [sheet, setSheet] = useState<'payment' | 'token' | null>(null);
  const inBranch = (locationId: string | undefined | null) => !branch.choice || !locationId || locationId === branch.choice;
  const tokens = useMemo(() => (p.board?.tokens ?? []).filter((x) => inBranch(x.locationId)), [p.board, branch.choice]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupBookings((p.appointments ?? []).filter((a) => inBranch(a.locationId))), [p.appointments, branch.choice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Jira GRW-409 — every action here is the desk's today; each is still asked of the shared rule, so a role that
  // lands on this Home without them is shown no button that answers 403. New token writes a queue entry, so it
  // rides on the same action as a walk-in.
  const mayBook = useMayUse('visit.new');
  const mayRecordPayment = useMayUse('visit.recordPayment');

  // Who is in each chair right now: an unpaid visit whose time has come (GRW-222's "until paid" rule).
  const busy = useMemo(() => {
    const m = new Map<string, { client: string; min: number }>();
    for (const g of groups) {
      if (liveState(g, now) !== 'in_service') continue;
      for (const a of g.appointments) {
        if (a.providerId && !m.has(a.providerId)) m.set(a.providerId, { client: clientNameLabel(g) ?? summarizeServices(g.serviceNames), min: minutesBetween(g.startAt, now) });
      }
    }
    return m;
  }, [groups, now]);

  /*
   * Booked for today: the day's bookings still open that no token stands for. A walk-in has a token from the moment
   * it is recorded (GRW-403), so this is the clients booked ahead who are not on the board yet.
   */
  const onBoard = useMemo(() => new Set(tokens.flatMap((x) => x.legIds)), [tokens]);
  const booked = bookedNotOnBoard(groups, onBoard);

  const waitingLong = tokens.filter((x) => x.state === 'waiting' && minutesBetween(x.addedAt, now) >= 10).length;
  const attention = [
    { key: 'unmarked', count: groups.filter((g) => countsAsNotMarked(g, now)).length, label: t.notMarkedDone, tone: 'amber', href: '/appointments?status=confirmed&unmarked=1', icon: <IconClock /> },
    { key: 'waiting', count: waitingLong, label: t.waitingOver10, tone: 'rose', href: '#hm-queue', icon: <IconMenu /> },
    { key: 'cancelled', count: groups.filter((g) => g.status === 'cancelled').length, label: t.cancelledTodayShort, tone: 'violet', href: '/appointments?status=cancelled', icon: <IconBan /> },
  ];

  // New token names the branch it adds to only when there is more than one to add to.
  const tokenBranch = branch.one;
  const tokenBranchName = branch.multi && !branch.pinned ? (branch.branches.find((b) => b.id === tokenBranch)?.name ?? null) : null;

  return (
    <>
      <HomeHeader t={t} title={t.greeting(p.greetingPart)} sub={t.receptionSub} businessName={p.businessName} locationName={p.locationName} dateLabel={p.dateLabel} />

      <div className="page-body hm-page hm-desk">
        {/* New token first: the one tap every client at the counter starts with (AC-04). */}
        <div className="hm-primary-actions tb-actions-row">
          {mayBook ? (
            <button type="button" className="hm-action hm-action-dark" onClick={() => setSheet('token')}>
              <IconPlus />
              <strong>{w.newToken}</strong>
            </button>
          ) : null}
          {mayRecordPayment ? (
            <button type="button" className="hm-action" onClick={() => setSheet('payment')}>
              <IconReceipt />
              <strong>{w.recordPayment}</strong>
            </button>
          ) : null}
          {mayBook ? (
            <a href="/appointments/new?mode=later" className="hm-action tb-new-booking hm-desktop">
              <IconCalendarPlus />
              <strong>{w.newBooking}</strong>
            </a>
          ) : null}
        </div>

        <section>
          <h2 className="hm-section-title">{t.needsAttention}</h2>
          <div className="hm-att-tiles">
            {attention.map((a) => (
              <a key={a.key} className={`hm-att-tile hm-tone-${a.tone}`} href={a.href}>
                <span className="hm-att-icon">{a.icon}</span>
                <strong className="hm-att-count">{a.count}</strong>
                <IconChevronRight />
                <span className="hm-att-tile-label">{a.label}</span>
              </a>
            ))}
          </div>
        </section>

        {p.board === null ? <CardError t={t} /> : <TokenBoard t={t} w={w} tokens={tokens} providers={p.providers} busy={busy} timezone={p.timezone} nowISO={p.nowISO} />}

        <BookedToday t={t} w={w} groups={booked} failed={p.appointments === null} timezone={p.timezone} />

        <QuickTiles
          items={[
            { href: '/customers?add=1', label: t.addCustomer, icon: <IconUserPlus />, tone: 'blue' },
            // Jira GRW-404 — Record payment moved up beside New token; Walk-in now (start a visit with a stylist straight
            // away) keeps a way in on a laptop, where the phone's centre button is not.
            ...(mayBook ? [{ href: '/appointments/new?mode=now', label: t.walkInShort, icon: <IconScissors />, tone: 'green' as const }] : []),
            { href: '/attendance', label: t.nav.attendance, icon: <IconClipboardCheck />, tone: 'violet' },
            // `/customers` search, not `/search`: the global search route is not
            // on the receptionist's allowlist (GRW-199), the client list's is.
            { href: '/customers', label: t.findCustomer, icon: <IconSearch />, tone: 'amber' },
          ]}
        />
      </div>

      {sheet === 'payment' ? <NewVisitSheet mode="now" purpose="payment" timezone={p.timezone} onClose={() => setSheet(null)} /> : null}
      {sheet === 'token' ? <NewTokenSheet w={w} location={tokenBranch} branchName={tokenBranchName} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
