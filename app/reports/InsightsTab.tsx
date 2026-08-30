'use client';

import type { ReactNode } from 'react';

import { copy } from '../lib/copy';
import type { ReportInsight, ReportInsights, ReportInsightKey } from '../lib/api';
import { IconAlert, IconArrowRight, IconCoins, IconFlame, IconPercent, IconTarget, IconTrendDown, IconTrendUp } from '../components/icons';
import { money } from './shared';

const TONE: Record<ReportInsightKey, string> = {
  growth: 'var(--rp-green-ink)',
  quietCustomers: 'var(--rp-red)',
  repeatRevenue: 'var(--rp-teal)',
  peakWindow: 'var(--rp-amber)',
  overdueRegulars: 'var(--rp-purple)',
  bestPerBooking: 'var(--rp-green-ink)',
};

const TINT: Record<ReportInsightKey, string> = {
  growth: '#f0f9f3',
  quietCustomers: '#fdf0ed',
  repeatRevenue: '#eafaf6',
  peakWindow: '#fef7ec',
  overdueRegulars: '#f5f1fe',
  bestPerBooking: '#f0f9f3',
};

function icon(key: ReportInsightKey, values: Record<string, number | string>): ReactNode {
  switch (key) {
    case 'growth':
      return values.direction === 'down' ? <IconTrendDown /> : <IconTrendUp />;
    case 'quietCustomers':
      return <IconAlert />;
    case 'repeatRevenue':
      return <IconPercent />;
    case 'peakWindow':
      return <IconFlame />;
    case 'overdueRegulars':
      return <IconTarget />;
    default:
      return <IconCoins />;
  }
}

/**
 * The sentences.
 *
 * Composed here, from facts the server computed, because the wording belongs
 * in copy.ts and the money belongs in formatMoney — an insight is the most
 * read text on the screen and would otherwise be the one place a currency
 * symbol and a plain-language phrase got hardcoded in a SQL file
 * (conventions §4 and §12).
 */
function sentence(insight: ReportInsight): { headline: string; body: string } {
  const v = insight.values;
  switch (insight.key) {
    case 'growth': {
      const up = v.direction === 'up';
      const change = Math.abs(Number(v.changePct));
      return {
        headline: `Money is ${up ? 'up' : 'down'} ${change}% on the stretch before`,
        body: `You earned ${money(Number(v.revenueMinor))} this time. ${
          up ? 'Whatever you changed, it is working.' : 'Worth a look at which services and days fell away.'
        }`,
      };
    }
    case 'quietCustomers':
      return {
        headline: `${v.quiet} clients have not been in for a month`,
        body: `${v.overdue} of them are past their own usual gap, and ${v.highValue} have spent over ₹10,000 with you.`,
      };
    case 'overdueRegulars':
      return {
        headline: `${v.overdue} regulars are due back`,
        body: 'Each one is past the gap they normally leave between visits. A nudge tends to bring these back fastest.',
      };
    case 'repeatRevenue':
      return {
        headline: `Regulars brought in ${v.sharePct}% of your money`,
        body: 'Your business leans on people coming back. Keeping them matters more than finding new ones.',
      };
    case 'peakWindow':
      return {
        headline: `${v.peakDay} around ${v.peakHour} is your busiest hour`,
        body: `${v.quietDay} at ${v.quietHour} is the quietest hour anyone books. Room to move work across, or to run something there.`,
      };
    default:
      return {
        headline: `${v.service} earns the most per booking`,
        body: `At ${money(Number(v.avgPriceMinor))} a visit it out-earns ${v.busiest}, your most-booked service, which averages ${money(
          Number(v.busiestAvgMinor),
        )}.`,
      };
  }
}

/**
 * What to do — six findings, each one a rule over figures another tab shows.
 *
 * A rule with nothing to say renders nothing. It is never replaced by a
 * vaguer version of itself, and none of this is generated text: the design's
 * own banner promises these are calculated rather than guessed, and a
 * sentence a language model wrote could be neither tested nor traced back to
 * a number (GRW-58).
 */
export function InsightsTab({ data, onTab }: { data: ReportInsights; onTab: (tab: string) => void }) {
  const c = copy.reports.insightsTab;

  return (
    <div className="rp-stack">
      <section className="rp-banner">
        <div className="rp-banner-kicker">{c.bannerKicker}</div>
        <div className="rp-banner-body">{c.bannerBody}</div>
      </section>

      {data.insights.length === 0 ? (
        <section className="rp-card rp-card-quiet">
          <div>
            <h2>{c.none}</h2>
            <p className="rp-card-sub">{c.noneHint}</p>
          </div>
        </section>
      ) : (
        <>
          <div className="rp-insight-grid">
            {data.insights.map((insight) => {
              const { headline, body } = sentence(insight);
              return (
                <article key={insight.key} className="rp-card rp-insight">
                  <div className="rp-insight-head">
                    <span
                      className="rp-insight-icon"
                      style={{ background: TINT[insight.key], color: TONE[insight.key] }}
                    >
                      {icon(insight.key, insight.values)}
                    </span>
                    <span className="rp-insight-cat">{c.categories[insight.key]}</span>
                  </div>
                  <h2 className="rp-insight-headline">{headline}</h2>
                  {/* Never truncated: a half-sentence insight is worse than none. */}
                  <p className="rp-insight-body">{body}</p>
                  <button type="button" className="rp-insight-cta" onClick={() => onTab(insight.tab)}>
                    {c.ctas[insight.key]}
                    <span className="rp-opp-chev"><IconArrowRight /></span>
                  </button>
                </article>
              );
            })}
          </div>
          {/* Said out loud rather than padding the grid to six. */}
          {data.insights.length < data.possible && (
            <p className="rp-card-foot rp-standalone-foot">{c.showing(data.insights.length, data.possible)}</p>
          )}
        </>
      )}
    </div>
  );
}
