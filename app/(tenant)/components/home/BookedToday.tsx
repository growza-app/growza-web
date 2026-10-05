'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api, formatTime } from '../../lib/api';
import { clientNameLabel, summarizeServices, type BookingGroup } from '../../lib/appointment-display';
import type { HomeCopy } from '../../lib/home-copy';
import { useMayUse } from '../SessionProvider';
import { CardError } from './parts';
import type { TokenWords } from './token-words';
import { announceVisitChanged } from '../../lib/visit-changed';

/**
 * Jira GRW-404 · GRW-405 (epic GRW-283) — today's bookings that are not on the token board yet, and "Arrived".
 *
 * Only visits booked AHEAD are listed (`bookedAhead` from the API, the rule `markArrived` applies): a walk-in is on
 * the board from the moment it is recorded, and one recorded before tokens existed is not "arriving" (review of
 * GRW-405). "Arrived" gives the booking today's next token, straight into With stylist (the booking already names
 * its stylist); a second tap or a second desk gets the same token back.
 *
 * When Arrived takes a row off this list, focus goes to the row now in its place, else to the list's heading —
 * never lost to the page (review of GRW-404).
 *
 * Its own component so the owner's "Tokens today" card can offer the same list beside the same board.
 */
export function BookedToday({
  t,
  w,
  groups,
  failed,
  timezone,
}: {
  t: HomeCopy;
  w: TokenWords;
  /** Today's visits, already narrowed to the branch; this keeps the open, booked-ahead ones with no token. */
  groups: BookingGroup[] | null;
  /** The day's bookings could not be read. */
  failed: boolean;
  /** Leg ids the board already holds a token for. */
  timezone: string;
}) {
  const router = useRouter();
  const [arriving, setArriving] = useState<string | null>(null);
  /** Jira GRW-409 — Arrived writes a token; a role the API refuses that to is shown the booking, not the button. */
  const mayArrive = useMayUse('token.arrive');
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const restore = useRef<number | null>(null);

  const booked = groups ?? [];

  useEffect(() => {
    const at = restore.current;
    if (at === null) return;
    const active = document.activeElement;
    if (active && active !== document.body && !listRef.current?.contains(active)) return;
    restore.current = null;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.tb-row button') ?? []);
    (buttons[Math.min(at, buttons.length - 1)] ?? listRef.current?.querySelector<HTMLElement>('h2'))?.focus();
  }, [booked.length]);

  const arrive = async (key: string, index: number, appointmentId: string) => {
    setArriving(key);
    setError(null);
    try {
      await api.markArrived(appointmentId);
      restore.current = index;
      router.refresh();
      announceVisitChanged();
    } catch (e) {
      setError({ key, message: e instanceof ApiError ? e.message : t.couldNotGive });
    } finally {
      setArriving(null);
    }
  };

  return (
    <section className="hm-card tb-booked" ref={listRef} aria-labelledby="tb-booked-title">
      <div className="hm-card-head">
        <h2 id="tb-booked-title" tabIndex={-1}>
          {w.bookedToday} <small>{w.bookedTodaySub}</small>
        </h2>
        <a className="hm-link" href="/appointments">
          {t.viewAll} ›
        </a>
      </div>
      {failed ? (
        <CardError t={t} />
      ) : booked.length === 0 ? (
        <p className="hm-empty">{w.nothingBooked}</p>
      ) : (
        <ol className="tb-rows">
          {booked.map((g, i) => {
            const name = clientNameLabel(g) ?? summarizeServices(g.serviceNames, t.lang);
            return (
              <li key={g.key} className="tb-row tb-row-booked">
                <span className="tb-time">{formatTime(g.startAt, timezone)}</span>
                <span className="tb-main">
                  <span className="tb-name">{name}</span>
                  <span className="tb-sub">
                    {summarizeServices(g.serviceNames, t.lang)}
                    {g.providerNames.length ? ` · ${g.providerNames.join(', ')}` : ''}
                  </span>
                  {error?.key === g.key ? (
                    <span className="tb-row-error" role="alert">
                      {error.message}
                    </span>
                  ) : null}
                </span>
                <span className="tb-actions">
                  {mayArrive ? (
                    <button
                      type="button"
                      className="hm-give tb-pay"
                      aria-label={w.arrivedFor(name)}
                      disabled={arriving !== null}
                      onClick={() => void arrive(g.key, i, g.appointments[0]!.id)}
                    >
                      {arriving === g.key ? w.arriving : w.arrived}
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * The visits "Booked for today" lists: open (every leg still confirmed), booked ahead (not a walk-in), and not
 * already on the board. Exported for its test.
 */
export function bookedNotOnBoard(groups: BookingGroup[], legsOnBoard: ReadonlySet<string>): BookingGroup[] {
  return groups.filter(
    (g) =>
      g.status === 'confirmed' &&
      g.appointments.every((a) => a.status === 'confirmed') &&
      g.appointments[0]?.bookedAhead !== false &&
      !g.appointments.some((a) => legsOnBoard.has(a.id)),
  );
}
