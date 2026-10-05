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
 * the API. The amount is on the slide at once, from the overview Home already holds; the rest fills in as each branch's
 * answer arrives, and a branch whose read fails keeps its amount and simply has no more.
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

  /*
   * A new period or branch list starts empty; a refresh keeps the old figures on screen until the new arrive.
   * Either way a read the next one has overtaken is dropped (`live`), so a late answer cannot show the wrong period.
   */
  const shownFor = useRef('');
  useEffect(() => {
    let live = true;
    const key = `${period}|${ids}`;
    if (shownFor.current !== key) {
      shownFor.current = key;
      setFigures({});
    }
    for (const id of ids.split(',').filter(Boolean)) {
      api
        .home(period, id)
        .then((d) => live && setFigures((f) => ({ ...f, [id]: d.money })))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [period, ids, refreshKey]);

  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
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
