'use client';

import { useEffect, useState, useRef } from 'react';
import { api, type DaySummary } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { IconClose } from '../icons';
import { Avatar, CardError, rupees } from './parts';
import { PaymentBar } from './MoneyHero';
import { TokenFigures } from './TokenFigures';
import { useTranslations } from 'next-intl';
import { useDialog } from '../../../shared/a11y/useDialog';
import { useNoProvider } from '../../lib/use-no-provider';
import { branchTag } from '../../lib/day-summary-view';

/**
 * Jira GRW-222 — the end-of-day readout: what came in, how, and who did it.
 *
 * A bottom sheet on a phone and a centred panel on a laptop — one component,
 * the CSS decides. Fetched when opened rather than with the page, because most
 * visits to Home never open it and it runs the per-staff performance query.
 */
export function DaySummarySheet({ t, locationId, subtitle, onClose }: { t: HomeCopy; locationId: string | null; subtitle: string; onClose: () => void }) {
  const [data, setData] = useState<DaySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tt = useTranslations('tokens');

  /**
   * Jira GRW-450 — the branch opened FROM the all-branches view, without leaving the sheet.
   *
   * The owner's question at closing is one question in two parts: "how did we do" and then "how did that shop
   * do". Closing the sheet, switching the header's branch and opening it again is the same two parts with the
   * first answer thrown away. Null means the view the sheet was opened on.
   */
  const [opened, setOpened] = useState<{ id: string; name: string } | null>(null);
  const showing = opened?.id ?? locationId;

  useEffect(() => {
    let live = true;
    setFailed(false);
    setData(null);
    api
      .daySummary(showing)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [showing, attempt]);

  // Jira GRW-342 — Escape, focus in, Tab kept inside, focus back on the button that opened it.
  useDialog(dialogRef, { onClose });

  return (
    <div className="hm-overlay" role="presentation" onClick={onClose}>
      <div className="hm-sheet" role="dialog" aria-modal="true" aria-labelledby="hm-sheet-title" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          <div>
            {/* Jira GRW-450 — the way back out of a branch, before its name, so it reads as "← All branches / Koramangala". */}
            {opened ? (
              <button type="button" className="hm-ds-back" onClick={() => setOpened(null)}>
                ← {t.backToAll}
              </button>
            ) : null}
            <h2 id="hm-sheet-title">{t.todaysSummary}</h2>
            <p>{opened ? opened.name : subtitle}</p>
          </div>
          <button type="button" className="hm-icon-btn" aria-label={t.close} onClick={onClose}>
            <IconClose />
          </button>
        </div>

        {failed ? (
          <CardError t={t} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !data ? (
          <div className="hm-skeleton" style={{ height: 260 }} aria-busy="true" />
        ) : (
          <div className="hm-sheet-grid">
            <section className="hm-hero hm-hero-small">
              <div className="hm-eyebrow">{t.moneyTaken}</div>
              <div className="hm-hero-amount">{rupees(data.revenueMinor)}</div>
              <div className="hm-hero-stats">
                <span>
                  <strong>{data.bookings}</strong> {t.bookingWord(data.bookings)}
                </span>
                <span>
                  <strong>{data.done}</strong> {t.done}
                </span>
                <span>
                  <strong>{data.notDone}</strong> {t.notDone}
                </span>
              </div>
            </section>

            {/*
              Jira GRW-450 — the split, directly under the total it splits.
              Sent only when no branch was asked for and there is more than one, so this renders itself out of
              existence on a branch's own summary and in every one-branch business.
            */}
            {data.branches && data.branches.length > 0 ? (
              <section className="hm-card hm-sheet-wide">
                <div className="hm-card-head">
                  <h2>
                    {t.eachBranch} <small>{t.eachBranchSub}</small>
                  </h2>
                </div>
                <ul className="hm-rows">
                  {data.branches.map((b) => (
                    <li key={b.id} className="hm-row hm-ds-branch">
                      <button type="button" className="hm-ds-branch-btn" onClick={() => setOpened({ id: b.id, name: b.name })}>
                        <span className="hm-row-main">
                          <span className="hm-row-name">{b.name}</span>
                        </span>
                        <span className="hm-row-meta">{t.staffBookings(b.bookings)}</span>
                        <span className="hm-row-money">{rupees(b.revenueMinor)}</span>
                        <span className="hm-ds-branch-go" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="hm-card">
              <div className="hm-card-head">
                <h2>{t.howPaid}</h2>
              </div>
              <PaymentBar t={t} slices={data.byPaymentMode} total={data.revenueMinor} variant="list" />
            </section>

            {/* Jira GRW-406 — the counter's day: tokens given, served, paid, and who left without service. */}
            {data.tokens ? (
              <section className="hm-card hm-sheet-wide">
                <div className="hm-card-head">
                  <h2>
                    {tt('figuresToday')} <small>{tt('figuresSub')}</small>
                  </h2>
                </div>
                <TokenFigures figures={data.tokens} />
              </section>
            ) : null}

            <section className="hm-card hm-sheet-wide hm-ds-clients">
              <div className="hm-card-head">
                <h2>
                  {t.clientsToday} <small>{t.clientsTodaySub}</small>
                </h2>
              </div>
              <div className="hm-ds-stats">
                {[
                  { k: 'served', n: data.clients.served, label: t.served, tone: 'green' },
                  { k: 'new', n: data.clients.newClients, label: t.newToday, tone: 'blue' },
                  { k: 'back', n: data.clients.cameBack, label: t.cameBackToday, tone: 'violet' },
                  { k: 'rebooked', n: data.clients.rebooked, label: t.bookedNext, tone: 'green' },
                  { k: 'noshow', n: data.clients.noShows, label: t.didntCome, tone: 'amber' },
                  // Jira GRW-406 — "Left without service" is the tokens block's now, counted from the token state; two
                  // tiles with one label and two numbers would be one too many. Kept for an older API.
                  ...(data.tokens ? [] : [{ k: 'left', n: data.clients.walkedOut, label: t.walkedOut, tone: 'rose' }]),
                ].map((x) => (
                  <span key={x.k} className={`hm-ds-stat hm-tone-${x.tone}`}>
                    <strong>{x.n}</strong>
                    {x.label}
                  </span>
                ))}
              </div>
              <div className="hm-ds-lists">
                <div>
                  <h3>{t.newTodayList}</h3>
                  {data.clients.newNames.length === 0 ? (
                    <p className="hm-empty">{t.nobodyNew}</p>
                  ) : (
                    <ul>
                      {data.clients.newNames.map((c) => (
                        <li key={c.id}>
                          <Avatar name={c.name} id={c.id} size={28} />
                          <span>{c.name ?? t.unnamed}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>{t.callThem}</h3>
                  {data.clients.noShowNames.length === 0 ? (
                    <p className="hm-empty">{t.everyoneCame}</p>
                  ) : (
                    <ul>
                      {data.clients.noShowNames.map((c) => (
                        <li key={c.id}>
                          <Avatar name={c.name} id={c.id} size={28} />
                          <span>{c.name ?? t.unnamed}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3>{t.topClients}</h3>
                  {data.clients.topSpenders.length === 0 ? (
                    <p className="hm-empty">{t.noSpendYet}</p>
                  ) : (
                    <ul>
                      {data.clients.topSpenders.map((c) => (
                        <li key={c.id}>
                          <Avatar name={c.name} id={c.id} size={28} />
                          <span>{c.name ?? t.unnamed}</span>
                          <strong>{rupees(c.revenueMinor)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <p className="hm-ds-foot">
                {t.viaWhatsApp(data.clients.byChannel.whatsapp)} · {t.atCounter(data.clients.byChannel.counter)} · {t.tomorrowCount(data.clients.tomorrowBookings)}
              </p>
            </section>

            <StaffToday t={t} staff={data.staff} branches={data.branches} />
          </div>
        )}

        <button type="button" className="hm-btn hm-btn-quiet hm-sheet-close" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  );
}

/**
 * Who worked today, with their bookings and money. Its own component (Jira GRW-363) so the rows
 * render in a test without the sheet's fetch.
 */
export function StaffToday({ t, staff, branches }: { t: HomeCopy; staff: DaySummary['staff']; branches?: DaySummary['branches'] }) {
  const noProvider = useNoProvider();
  return (
    <section className="hm-card hm-sheet-wide">
      <div className="hm-card-head">
        <h2>
          {t.staffToday} <small>{t.staffTodaySub}</small>
        </h2>
      </div>
      {staff.length === 0 ? (
        <p className="hm-empty">{t.nobodyWorked}</p>
      ) : (
        <ul className="hm-rows">
          {staff.map((s) => {
            // Jira GRW-363 — the no-stylist row in the words of the Record payment choice that made
            // it, with a neutral mark for an avatar; a person as typed.
            const nobody = s.key === 'unassigned';
            const name = nobody ? noProvider : s.name;
            // Jira GRW-450 — which branch they work at, but only while the list mixes them.
            const tag = branchTag(s.locationId, branches);
            return (
              <li key={s.id} className="hm-row">
                <Avatar name={name} id={s.id} size={34} nobody={nobody} />
                <span className="hm-row-main">
                  <span className="hm-row-name">{name}</span>
                  {tag ? <span className="hm-row-sub">{tag}</span> : null}
                </span>
                <span className="hm-row-meta">{t.staffBookings(s.bookings)}</span>
                <span className="hm-row-money">{rupees(s.revenueMinor)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
