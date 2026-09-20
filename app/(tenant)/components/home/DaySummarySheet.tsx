'use client';

import { useEffect, useState, useRef } from 'react';
import { api, type DaySummary } from '../../lib/api';
import type { HomeCopy } from '../../lib/home-copy';
import { IconClose } from '../icons';
import { Avatar, CardError, rupees } from './parts';
import { PaymentBar } from './MoneyHero';
import { useDialog } from '../../../shared/a11y/useDialog';

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

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .daySummary(locationId)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [locationId, attempt]);

  // Jira GRW-342 — Escape, focus in, Tab kept inside, focus back on the button that opened it.
  useDialog(dialogRef, { onClose });

  return (
    <div className="hm-overlay" role="presentation" onClick={onClose}>
      <div className="hm-sheet" role="dialog" aria-modal="true" aria-labelledby="hm-sheet-title" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="hm-sheet-head">
          <div>
            <h2 id="hm-sheet-title">{t.todaysSummary}</h2>
            <p>{subtitle}</p>
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

            <section className="hm-card">
              <div className="hm-card-head">
                <h2>{t.howPaid}</h2>
              </div>
              <PaymentBar t={t} slices={data.byPaymentMode} total={data.revenueMinor} variant="list" />
            </section>

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
                  { k: 'left', n: data.clients.walkedOut, label: t.walkedOut, tone: 'rose' },
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

            <section className="hm-card hm-sheet-wide">
              <div className="hm-card-head">
                <h2>
                  {t.staffToday} <small>{t.staffTodaySub}</small>
                </h2>
              </div>
              {data.staff.length === 0 ? (
                <p className="hm-empty">{t.nobodyWorked}</p>
              ) : (
                <ul className="hm-rows">
                  {data.staff.map((s) => (
                    <li key={s.id} className="hm-row">
                      <Avatar name={s.name} id={s.id} size={34} />
                      <span className="hm-row-main">
                        <span className="hm-row-name">{s.name}</span>
                      </span>
                      <span className="hm-row-meta">{t.staffBookings(s.bookings)}</span>
                      <span className="hm-row-money">{rupees(s.revenueMinor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <button type="button" className="hm-btn hm-btn-quiet hm-sheet-close" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>
  );
}
