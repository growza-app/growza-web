'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatMoney, formatTime, type Provider, type QueueEntry, type TokenRow } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { minutesBetween } from '../../lib/live-state';
import { IconHourglass } from '../icons';
import { NewVisitSheet } from '../NewVisitSheet';
import { useMayUse } from '../SessionProvider';
import { GiveToStaffSheet } from './GiveToStaffSheet';
import { VisitTill } from './VisitTill';
import type { TokenWords } from './token-words';

/**
 * Jira GRW-404 (epic GRW-283) — the day's tokens: Waiting · With stylist · Paid.
 *
 * Owner decision 2026-09-26: the front desk's Home IS this board. A laptop (or a tablet, ≥861px) sees the three
 * side by side; a phone sees them as three tabs, because three columns at 390px would be three unreadable
 * slivers. One markup for both: on a phone the tabs choose which column is shown (`data-tab`), so a column's rows,
 * empty state and actions cannot drift between the two layouts.
 *
 * Each column is exactly one token state (`TOKEN_STATE_SQL` on the server), so a token is always in one place:
 *
 * - **Waiting** — Give to a stylist (the queue's own sheet, GRW-222) or Record payment straight away (GRW-403).
 * - **With stylist** — Record payment opens the till on the visit (GRW-403).
 * - **Paid** — what they paid and how. Nothing to do.
 *
 * A token that left without being served is on no column (the owner's rule: an unpaid token that goes is just
 * "left"); the Day summary counts them (GRW-406).
 *
 * ## For a keyboard and a screen reader (review of Jira GRW-404)
 *
 * - On a phone the three are a real tabs widget: a named `tablist`, one tab in the Tab order (the chosen one),
 *   arrows / Home / End move between them, and each column is the `tabpanel` its tab controls. On a laptop there are
 *   no tabs at all — the columns are three regions named by their headings. Which of the two is decided from the
 *   same 860px breakpoint the CSS uses.
 * - Every row's buttons carry the token and the client in their names, after the words they show ("Record payment — token 3, Simran"): a
 *   list of six identical "Record payment" buttons says nothing about which one is which.
 * - When a sheet closes and its row has moved on (given, paid), focus goes to the row now in that place, else to
 *   the column — never lost to the page.
 *
 * Standalone on purpose: it takes the day's tokens and draws them, so the owner's "Tokens today" card can open
 * this same board without a second copy of it.
 */

type Column = 'waiting' | 'with_stylist' | 'paid';
const COLUMNS: Column[] = ['waiting', 'with_stylist', 'paid'];
const MODES = ['cash', 'card', 'upi', 'other'] as const;

/**
 * After a sheet closes: whether to put focus in its row's place, and whether to keep waiting for the board to catch
 * up. Pure, so the rule is tested without a browser (`token-board.test.ts`).
 *
 * The sheet closes BEFORE the board refreshes: on that first render the row is still in its column and the dialog
 * has handed focus back to the row's own button. Deciding then (review round 2 of Jira GRW-404) is what lost focus
 * after the till saved: the wish was dropped, and the refresh took the focused row away a moment later. So the wish
 * is kept while the row is still in its column, and acted on when the refresh really moves it on.
 */
export function afterSheet(s: {
  /** Focus is on nothing (the page itself). */
  lost: boolean;
  /** Focus is on the row the sheet was opened from. */
  onItsRow: boolean;
  /** That row is still in the column it was opened from. */
  rowStillThere: boolean;
}): { focus: boolean; keep: boolean } {
  // Somebody put focus somewhere else on purpose: leave it there, and stop waiting.
  if (!s.lost && !s.onItsRow) return { focus: false, keep: false };
  return { focus: s.lost, keep: s.rowStillThere };
}

/** Whether the phone layout (≤860px, the system's breakpoint) is in force. False on the server and before mount. */
function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

/**
 * Jira GRW-418 — is there anything on this board that still needs somebody?
 *
 * The owner's Home shows the board only when this is true, so that a salon which has finished for the day
 * keeps the one-screen Home of GRW-222 rather than displaying a column of paid tokens nobody has to act on.
 * Paid, left and cancelled are the day's history; waiting and with_stylist are work.
 */
export function hasLiveWork(tokens: readonly { state: TokenRow['state'] }[]): boolean {
  return tokens.some((x) => x.state === 'waiting' || x.state === 'with_stylist');
}

export function TokenBoard({
  t,
  w,
  tokens,
  providers,
  busy,
  timezone,
  nowISO,
}: {
  t: HomeCopy;
  w: TokenWords;
  /** The day's tokens (every state), already narrowed to the branch being looked at. */
  tokens: TokenRow[];
  providers: Provider[];
  /** providerId → who is in their chair, for the give sheet's free/busy pills. */
  busy: Map<string, { client: string; min: number }>;
  timezone: string;
  nowISO: string;
}) {
  const tcr = useTranslations('chrome');
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const phone = usePhoneLayout();
  const [tab, setTab] = useState<Column>('waiting');
  const [giving, setGiving] = useState<TokenRow | null>(null);
  const [paying, setPaying] = useState<TokenRow | null>(null);
  const [till, setTill] = useState<TokenRow | null>(null);
  /**
   * Jira GRW-409 — a row's buttons, each asked of the shared rule. A role the API would refuse is shown the token
   * and what it is waiting for, and no button that can only answer 403.
   */
  const mayGive = useMayUse('queue.give');
  const mayRecordPayment = useMayUse('visit.recordPayment');
  const mayCheckout = useMayUse('booking.checkout');
  const boardRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Column, HTMLButtonElement | null>>({ waiting: null, with_stylist: null, paid: null });
  /** Where focus should land once the board redraws after a sheet: the row, its column and its place in it. */
  const restore = useRef<{ id: string; col: Column; index: number } | null>(null);

  const columns: Record<Column, TokenRow[]> = {
    waiting: tokens.filter((x) => x.state === 'waiting'),
    with_stylist: tokens.filter((x) => x.state === 'with_stylist'),
    // Latest paid first: the one the desk just settled is the one it looks for.
    paid: tokens.filter((x) => x.state === 'paid').reverse(),
  };
  const heads: Record<Column, { title: string; tab: string; empty: string }> = {
    waiting: { title: w.waiting, tab: w.waitingTab(columns.waiting.length), empty: w.nobodyWaiting },
    with_stylist: { title: w.withProvider, tab: w.withTab(columns.with_stylist.length), empty: w.nobodyWith },
    paid: { title: w.paid, tab: w.paidTab(columns.paid.length), empty: w.nobodyPaid },
  };
  const modeWord = (mode: string | null) => {
    const known = MODES.find((m) => m === mode);
    return known ? tcr(`pay.${known}`) : null;
  };
  const nameOf = (x: TokenRow) => x.customerName ?? x.customerPhone ?? w.noName;
  /** A waiting token, as the queue's own sheets take it: a waiting client always has a name (GRW-222). */
  const asEntry = (x: TokenRow): QueueEntry => ({ ...x, customerName: nameOf(x) });

  /*
   * After a sheet: once its row has moved on (given, paid) and taken focus with it, put focus on whatever is now in
   * that place in the column, else on the column itself (its tab on a phone). Only when focus is really lost — a
   * person who has already clicked somewhere else keeps it there. See `afterSheet` for why the wish outlives the
   * sheet's own close.
   */
  useEffect(() => {
    const want = restore.current;
    if (!want || giving || paying || till) return;
    const panel = document.getElementById(`tb-col-${want.col}`);
    const active = document.activeElement;
    const next = afterSheet({
      lost: !active || active === document.body,
      onItsRow: Boolean(active && panel?.querySelector(`[data-token="${want.id}"]`)?.contains(active)),
      rowStillThere: tokens.some((x) => x.id === want.id && x.state === want.col),
    });
    if (!next.keep) restore.current = null;
    if (!next.focus) return;
    const rows = panel ? Array.from(panel.querySelectorAll<HTMLElement>('.tb-row')) : [];
    const row = rows[Math.min(want.index, rows.length - 1)];
    const target = row?.querySelector<HTMLElement>('button') ?? (phone ? tabRefs.current[want.col] : panel?.querySelector<HTMLElement>('h2'));
    target?.focus();
  }, [tokens, giving, paying, till, phone]);

  const open = (col: Column, index: number, set: (x: TokenRow) => void, x: TokenRow) => {
    restore.current = { id: x.id, col, index };
    set(x);
  };

  /** WAI-ARIA tabs: arrows move and choose, Home / End jump to the ends. */
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = COLUMNS.indexOf(tab);
    const next =
      e.key === 'ArrowRight' ? COLUMNS[(at + 1) % COLUMNS.length]
      : e.key === 'ArrowLeft' ? COLUMNS[(at + COLUMNS.length - 1) % COLUMNS.length]
      : e.key === 'Home' ? COLUMNS[0]
      : e.key === 'End' ? COLUMNS[COLUMNS.length - 1]
      : null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  /**
   * Jira GRW-481 — how long someone has been waiting, in the form that helps.
   * Under four hours a duration is what the desk wants; past that it has stopped
   * being a duration and become a fact about this morning, so hand over the
   * clock time they arrived instead. `arrivedAt` is a thunk because formatting a
   * time costs more than the comparison that decides whether we need it.
   */
  const waitingWord = (minutes: number, arrivedAt: () => string) =>
    minutes >= 4 * 60 ? t.sinceTime(arrivedAt()) : t.waitedFor(minutes);

  const services = (x: TokenRow) =>
    x.serviceNames.length > 0 ? x.serviceNames.join(' + ') : <span className="tb-muted">{w.servicesAtPayment}</span>;

  const row = (x: TokenRow, col: Column, index: number) => (
    <li key={x.id} className="tb-row" data-token={x.id}>
      {/* The number the client was told. */}
      <span className="tb-no hm-idx">{x.tokenNo}</span>
      <span className="tb-main">
        {/* Name and its one fact on a line; in a narrow column the fact drops under the name instead of squeezing it. */}
        <span className="tb-line">
          <span className="tb-name">{nameOf(x)}</span>
          <span className="tb-meta">
            {col === 'waiting'
              ? // Jira GRW-481 — past four hours a duration tells the desk nothing useful;
                // the time they walked in does. Jira GRW-541 · GRW-543 — a countdown icon, then the time, not the word "Waiting".
                [
                  <span key="icon" className="tb-meta-icon" aria-hidden="true">
                    <IconHourglass />
                  </span>,
                  waitingWord(minutesBetween(x.addedAt, now), () => formatTime(x.addedAt, timezone)),
                ]
              : col === 'with_stylist'
                ? // Jira GRW-405 — a booked client's visit runs at the booked time, not when they walked in.
                  (x.booked ? w.bookedAt : t.started)(formatTime(x.visitStartAt ?? x.addedAt, timezone))
                : [x.paidMinor !== null ? formatMoney(String(x.paidMinor)) : null, modeWord(x.paymentMode)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="tb-sub">
          {services(x)}
          {col === 'with_stylist' ? ` · ${x.providerName ?? w.noProvider}` : null}
        </span>
      </span>
      {col === 'waiting' ? (
        <span className="tb-actions">
          {mayGive ? (
            <button type="button" className="hm-give" aria-label={w.giveFor(x.tokenNo, nameOf(x))} onClick={() => open(col, index, setGiving, x)}>
              {w.giveTo}
            </button>
          ) : null}
          {mayRecordPayment ? (
            <button type="button" className="hm-give tb-pay" aria-label={w.payFor(x.tokenNo, nameOf(x))} onClick={() => open(col, index, setPaying, x)}>
              {w.recordPayment}
            </button>
          ) : null}
        </span>
      ) : col === 'with_stylist' ? (
        <span className="tb-actions">
          {mayCheckout ? (
            <button type="button" className="hm-give tb-pay" aria-label={w.payFor(x.tokenNo, nameOf(x))} onClick={() => open(col, index, setTill, x)}>
              {w.recordPayment}
            </button>
          ) : null}
        </span>
      ) : null}
    </li>
  );

  return (
    <div className="tb-board" data-tab={tab} id="hm-queue" ref={boardRef}>
      {/* A phone's three tabs. From 861px the columns stand side by side and this row is not drawn. */}
      <div className="hm-seg hm-seg-soft tb-tabs" role="tablist" aria-label={w.board} onKeyDown={onTabKey}>
        {COLUMNS.map((c) => (
          <button
            key={c}
            ref={(el) => {
              tabRefs.current[c] = el;
            }}
            type="button"
            role="tab"
            id={`tb-tab-${c}`}
            aria-selected={tab === c}
            aria-controls={`tb-col-${c}`}
            tabIndex={tab === c ? 0 : -1}
            className={tab === c ? 'is-on' : ''}
            onClick={() => setTab(c)}
          >
            {heads[c].tab}
          </button>
        ))}
      </div>
      <div className="tb-cols">
        {COLUMNS.map((c) => (
          <section
            key={c}
            className="hm-card tb-col"
            data-col={c}
            id={`tb-col-${c}`}
            {...(phone
              ? { role: 'tabpanel', 'aria-labelledby': `tb-tab-${c}`, tabIndex: 0 }
              : { 'aria-labelledby': `tb-col-title-${c}` })}
          >
            <div className="hm-card-head tb-col-head">
              <h2 id={`tb-col-title-${c}`} tabIndex={-1}>
                {heads[c].title} <span className="tb-count">{columns[c].length}</span>
              </h2>
            </div>
            {columns[c].length === 0 ? <p className="hm-empty">{heads[c].empty}</p> : <ol className="tb-rows">{columns[c].map((x, i) => row(x, c, i))}</ol>}
          </section>
        ))}
      </div>

      {giving ? <GiveToStaffSheet t={t} entry={asEntry(giving)} providers={providers} busy={busy} onClose={() => setGiving(null)} /> : null}
      {paying ? <NewVisitSheet mode="now" purpose="payment" token={asEntry(paying)} timezone={timezone} onClose={() => setPaying(null)} /> : null}
      {till ? (
        <VisitTill legIds={till.legIds} customerId={till.customerId} locationId={till.locationId} timezone={timezone} onClose={() => setTill(null)} />
      ) : null}
    </div>
  );
}
