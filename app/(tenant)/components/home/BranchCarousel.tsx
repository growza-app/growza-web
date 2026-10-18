'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { HomeOverview, HomePeriod } from '../../lib/home-types';
import type { HomeCopy } from '../../lib/home-copy';
import { IconMapPin, IconTrendDown, IconTrendUp } from '../icons';
import { rupees } from './parts';
import { PaymentLine } from './MoneyHero';

/**
 * The phone's money card, one slide per branch.
 *
 * On "All branches" the one hero card shows the business as a whole and the branches below it as a line of
 * names. Here each branch is its own card — the amount, how it was paid, bookings, new clients, came back — and the
 * cards slide sideways, the next one peeking in so it is clear there is more. The first slide is every branch together,
 * so the total the hero used to give is still the first thing read.
 *
 * `/api/v1/home` already answers for one branch (`?location=`), so each slide reads its own; nothing new is asked of
 * the API. The amount is on the slide at once, from the overview Home already holds; the rest is read for the slide on
 * screen and its neighbours only (see the effect below), and a branch whose read fails keeps its amount and simply has
 * no more.
 */
type Slide = { key: string; id: string | null; name: string; revenueMinor: number };
type Figures = HomeOverview['money'];

export function BranchCarousel({
  t,
  data,
  period,
  refreshKey,
  onPick,
}: {
  t: HomeCopy;
  data: HomeOverview;
  period: HomePeriod;
  /** Changes when the server's overview changes (a payment, Mark done…): each branch is re-read in place. */
  refreshKey: string | null;
  onPick: (id: string) => void;
}) {
  const slides: Slide[] = [
    { key: 'all', id: null, name: t.allBranches, revenueMinor: data.money.revenueMinor },
    ...data.branches.map((b) => ({ key: b.id, id: b.id, name: b.name, revenueMinor: b.revenueMinor })),
  ];
  const [figures, setFigures] = useState<Record<string, Figures>>({});
  const ids = data.branches.map((b) => b.id).join(',');
  // The slide on screen. Moved up from the scroll handler below: what is read now depends on it.
  const [at, setAt] = useState(0);

  /*
   * Only the slides on screen, and the one beside each, are read — not every branch at once.
   *
   * It used to read every branch's whole `/api/v1/home` on every Home load AND on every live refresh: a business with
   * three branches ran the overview's heaviest queries three more times, four with the page's own, for slides nobody
   * had scrolled to — and a ten-branch business ran ten. The first slide is the whole business and needs no read (it is
   * `data` already); the next one is read at once so the swipe has something to show; each further one is read as it
   * comes within a card of the screen.
   *
   * A new period or branch list starts empty; a refresh re-reads only what is in the window and keeps the old figures
   * on screen until the new arrive. An answer for a period or branch list that has since changed is dropped, so a late
   * one cannot show the wrong figures; moving the window does not drop anything in flight.
   */
  const branchIds = ids.split(',').filter(Boolean);
  const wanted = branchIds.filter((_, i) => Math.abs(i + 1 - at) <= 1);
  const wantedKey = wanted.join(',');
  const shownFor = useRef('');
  const stamp = useRef('');
  const read = useRef(new Set<string>());
  useEffect(() => {
    const base = `${period}|${ids}`;
    if (shownFor.current !== base) {
      shownFor.current = base;
      read.current = new Set();
      setFigures({});
    }
    const refreshed = stamp.current !== `${base}|${refreshKey}`;
    stamp.current = `${base}|${refreshKey}`;
    for (const id of wantedKey.split(',').filter(Boolean)) {
      if (!refreshed && read.current.has(id)) continue;
      read.current.add(id);
      api
        .home(period, id)
        .then((d) => shownFor.current === base && setFigures((f) => ({ ...f, [id]: d.money })))
        .catch(() => {
          // Let the next look at this slide try again rather than leave it empty for good.
          read.current.delete(id);
        });
    }
  }, [period, ids, refreshKey, wantedKey]);

  const track = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0');
    setAt(Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
  };
  const goTo = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
  };

  const stats = (m: Figures) => (
    <div className="bc-stats">
      <span>
        <b>{m.bookings}</b> {t.bookingWord(m.bookings)}
      </span>
      <span>
        <b>{m.newCustomers}</b> {t.newClientWord(m.newCustomers)}
      </span>
      {m.cameBackPct !== null ? (
        <span>
          <b>{m.cameBackPct}%</b> {t.cameBack}
        </span>
      ) : null}
    </div>
  );

  return (
    <section className="bc" aria-label={t.earningsByBranch}>
      <h2 className="bc-title">{t.earningsByBranch}</h2>
      <div ref={track} className="bc-track" onScroll={onScroll}>
        {slides.map((s, i) => {
          const m = s.id === null ? data.money : figures[s.id];
          const up = m?.deltaPct !== null && m?.deltaPct !== undefined && m.deltaPct >= 0;
          return (
            <article key={s.key} className="bc-card" aria-label={`${i + 1} / ${slides.length}: ${s.name}`}>
              <div className="bc-top">
                {s.id === null ? (
                  <span className="bc-pill">
                    <IconMapPin />
                    {s.name}
                  </span>
                ) : (
                  <button type="button" className="bc-pill bc-pill-btn" onClick={() => onPick(s.id!)}>
                    <IconMapPin />
                    {s.name}
                  </button>
                )}
                {m && m.deltaPct !== null && m.revenueMinor > 0 ? (
                  <span className={`bc-delta ${up ? 'up' : 'down'}`}>
                    {up ? <IconTrendUp /> : <IconTrendDown />}
                    {Math.abs(m.deltaPct)}%
                  </span>
                ) : null}
              </div>
              <div className="bc-amount">{rupees(s.revenueMinor)}</div>
              {m ? (
                <>
                  <PaymentLine t={t} slices={m.byPaymentMode} total={m.revenueMinor} onMore={() => (s.id ? onPick(s.id) : undefined)} />
                  {stats(m)}
                </>
              ) : (
                <div className="bc-wait" aria-hidden />
              )}
            </article>
          );
        })}
      </div>
      <div className="bc-dots">
        {slides.map((s, i) => (
          <button key={s.key} type="button" className={i === at ? 'is-on' : ''} aria-label={`${s.name} (${i + 1} / ${slides.length})`} aria-current={i === at} onClick={() => goTo(i)} />
        ))}
      </div>
    </section>
  );
}
