'use client';

import { useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { formatTime, type QueueEntry } from '../../lib/api';
import { clientNameLabel, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import type { HomeCopy } from '../../lib/home-copy';
import { minutesBetween } from '../../lib/live-state';
import { ALERTS_SHOWN, rightNow, type NowAlert } from '../../lib/right-now';
import { useDialog } from '../../../shared/a11y/useDialog';
import { IconAlert, IconCalendar, IconCheck, IconChevronRight, IconClock, IconClose, IconMenu, IconUserCheck } from '../icons';
import { Card, CardError } from './parts';

/**
 * Jira GRW-351 — "Right now", beside Bookings today on a laptop (≥1101px; CSS hides it below).
 *
 * Alerts first, worst first, then three plain rows: who is in the chair, who is next, who is waiting. The rules are
 * in `lib/right-now.ts`; this only draws them. A waiting walk-in is a notice for the owner, not a link: the front
 * desk's queue is where it is dealt with.
 *
 * ## As many alerts as fit, and every one a tap away
 *
 * On a laptop Home is one screen (`.hm-fit`), and this card gets the height Bookings today gets. At 1280×720 that is
 * about 170px — less after closing, when the "Day closed" banner takes a row. A card that scrolled would hide
 * "Next up" behind a scrollbar, so it lists as many alerts as leave the rows in view (three, two, one), then
 * "+N more"; with no room for even one, a single line says how many there are. Either opens "See all", a dialog
 * with every alert (a deviation from GRW-351 AC-02's fixed three, decided in review, for the owner to confirm).
 * The count is measured, not guessed, the same way the Bookings list counts its rows.
 *
 * ## A failed read never looks like "all clear" (BR-12)
 *
 * No visits: the card is an error, like Bookings today. No queue: the Walk-ins row is left out (AC-04) AND the card
 * says it could not check who is waiting, instead of "Nothing needs you right now".
 */

const who = (g: BookingGroup, lang: string) => clientNameLabel(g) ?? summarizeServices(g.serviceNames, lang);

interface RightNowProps {
  t: HomeCopy;
  /**
   * Today's visits for the branch Home shows. Null when they could not be read: the card says so, as Bookings today
   * does, rather than claiming nobody is in.
   */
  today: BookingGroup[] | null;
  /** Tomorrow's, for after closing. Null when they could not be read (or are not needed). */
  tomorrow: BookingGroup[] | null;
  /** Today's walk-in queue for that branch; null when it could not be read. */
  queue: QueueEntry[] | null;
  now: Date;
  /** The branch (or business) Home shows has closed for the day: the card follows Bookings to tomorrow. */
  afterClose: boolean;
  timezone: string;
}

export function RightNow(p: RightNowProps) {
  if (p.today === null) {
    return (
      <Card className="hm-area-now" title={p.t.rightNow}>
        <CardError t={p.t} />
      </Card>
    );
  }
  return <Live {...p} today={p.today} />;
}

/**
 * How many alerts fit: start from `ALERTS_SHOWN` whenever the alerts or the card's size change, then drop one at a
 * time while the card overflows, down to none listed. The card's height comes from the grid row, not from what is
 * in it, so what is drawn here cannot feed the measurement (the Jira GRW-225 lesson). Below the one-screen laptop
 * layout nothing overflows and all three stay.
 */
function useAlertRoom(bodyRef: RefObject<HTMLDivElement | null>, total: number, setRoom: Dispatch<SetStateAction<number>>): void {
  const seen = useRef(total);
  useLayoutEffect(() => {
    if (seen.current !== total) {
      seen.current = total;
      setRoom(ALERTS_SHOWN);
      return;
    }
    const el = bodyRef.current;
    if (el && el.scrollHeight > el.clientHeight + 1) setRoom((r) => Math.max(0, r - 1));
  });
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // A new size, or the web font arriving (it changes line heights, not the card's size): one fewer if it now
    // overflows, else try all three again and let the check above step back down. Either way the state changes when
    // it has to, so a card already at three that stops fitting is measured again.
    let live = true;
    const remeasure = () => {
      if (live) setRoom((r) => (el.scrollHeight > el.clientHeight + 1 ? Math.max(0, r - 1) : ALERTS_SHOWN));
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(el);
    void document.fonts?.ready.then(remeasure);
    return () => {
      live = false;
      ro.disconnect();
    };
  }, [bodyRef, setRoom]);
}

function AlertRow({ t, alert }: { t: HomeCopy; alert: NowAlert<BookingGroup, QueueEntry> }) {
  const name = alert.kind === 'over_time' ? who(alert.group, t.lang) : alert.entry.customerName;
  const sub = alert.kind === 'over_time' ? t.overBooked(alert.minutes) : t.waitingMin(alert.minutes);
  // The name gives way first; the minutes never do (AC-02). The whole line is the tooltip.
  return (
    <li className={`hm-now-alert hm-now-alert-${alert.kind === 'over_time' ? 'amber' : 'rose'}`} title={`${name} · ${sub}`}>
      <IconAlert />
      <strong className="hm-now-alert-name">{name}</strong>
      <span className="hm-now-alert-sub">{sub}</span>
    </li>
  );
}

function Live({ t, today, tomorrow, queue, now, afterClose, timezone }: RightNowProps & { today: BookingGroup[] }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(ALERTS_SHOWN);
  const [allOpen, setAllOpen] = useState(false);
  const s = rightNow({ today, tomorrow, queue, now, afterClose, room });
  // The number of alerts does not depend on how many are listed, so it can say when to measure again.
  useAlertRoom(bodyRef, s.allAlerts.length, setRoom);

  const next = s.next;
  const nextRow = next
    ? {
        lead: formatTime(next.startAt, timezone),
        detail: who(next, t.lang),
        tail: s.nextIsTomorrow ? undefined : t.inMinShort(minutesBetween(now, next.startAt)),
      }
    : { detail: s.nextIsTomorrow ? (tomorrow === null ? t.couldNotLoad : t.nothingTomorrow) : t.nothingLater };

  return (
    <Card className="hm-area-now" title={t.rightNow}>
      <div className="hm-now" ref={bodyRef}>
        {s.allAlerts.length ? (
          <ul className="hm-now-alerts" aria-label={t.rightNowAlerts}>
            {s.alerts.map((a) => (
              <AlertRow key={a.key} t={t} alert={a} />
            ))}
            {s.alerts.length === 0 ? (
              <li>
                <button type="button" className="hm-now-alert hm-now-alert-rose hm-now-count" aria-haspopup="dialog" onClick={() => setAllOpen(true)}>
                  <IconAlert />
                  <strong className="hm-now-alert-name">{t.alertCount(s.allAlerts.length)}</strong>
                  <span className="hm-now-alert-sub">
                    {t.seeAll}
                    <IconChevronRight />
                  </span>
                </button>
              </li>
            ) : s.moreAlerts > 0 ? (
              <li>
                <button type="button" className="hm-now-more" aria-haspopup="dialog" onClick={() => setAllOpen(true)}>
                  {t.moreAlerts(s.moreAlerts)}
                </button>
              </li>
            ) : null}
          </ul>
        ) : s.calm ? (
          <p className="hm-now-calm">
            <IconCheck />
            <span>{t.nothingNeedsYou}</span>
          </p>
        ) : null}
        {s.queueUnread ? (
          <p className="hm-now-unread">
            <IconAlert />
            <span>{t.queueUnread}</span>
          </p>
        ) : null}

        <ul className="hm-now-rows">
          {s.inChair ? (
            <NowRow icon={<IconUserCheck />} label={t.inTheChair} count={s.inChair.length} detail={s.inChair.map((g) => who(g, t.lang)).join(', ')} />
          ) : null}
          <NowRow icon={s.nextIsTomorrow ? <IconCalendar /> : <IconClock />} label={s.nextIsTomorrow ? t.firstTomorrow : t.nextUp} {...nextRow} />
          {s.walkIns ? (
            <NowRow icon={<IconMenu />} label={t.walkInsWaiting} count={s.walkIns.count} tail={s.walkIns.count > 0 ? t.longestWait(s.walkIns.longestMin) : undefined} />
          ) : null}
        </ul>
      </div>
      {allOpen ? <AllAlerts t={t} alerts={s.allAlerts} onClose={() => setAllOpen(false)} /> : null}
    </Card>
  );
}

/**
 * The value side of a row: an optional count and leading time that never shrink, a detail (names) that gives way
 * with "…", and a tail ("in 10 min", "longest 25 min") that never does. The full line is the tooltip.
 */
function NowRow({ icon, label, count, lead, detail, tail }: { icon: ReactNode; label: string; count?: number; lead?: string; detail?: string; tail?: string }) {
  const full = [lead, detail, tail].filter(Boolean).join(' · ');
  return (
    <li className="hm-now-row">
      <span className="hm-now-icon">{icon}</span>
      <span className="hm-now-label">{label}</span>
      <span className="hm-now-value" title={full || undefined}>
        {count !== undefined ? <strong>{count}</strong> : null}
        {lead ? <strong>{lead}</strong> : null}
        {detail ? <span className="hm-now-detail">{detail}</span> : null}
        {tail ? <span className="hm-now-tail">{tail}</span> : null}
      </span>
    </li>
  );
}

/** "See all": every alert, worst first, in the same words. A dialog: focus moves in, Escape closes, focus returns. */
export function AllAlerts({ t, alerts, onClose }: { t: HomeCopy; alerts: Array<NowAlert<BookingGroup, QueueEntry>>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose });
  return (
    <div className="hm-overlay" role="presentation" onClick={onClose}>
      <div className="hm-sheet hm-sheet-narrow hm-now-sheet" role="dialog" aria-modal="true" aria-labelledby="hm-now-all-title" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          <div>
            <h2 id="hm-now-all-title">{t.rightNowAlerts}</h2>
            <p>{alerts.length ? t.alertCount(alerts.length) : t.nothingNeedsYou}</p>
          </div>
          <button type="button" className="hm-icon-btn" aria-label={t.close} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {alerts.length ? (
          <ul className="hm-now-alerts">
            {alerts.map((a) => (
              <AlertRow key={a.key} t={t} alert={a} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
