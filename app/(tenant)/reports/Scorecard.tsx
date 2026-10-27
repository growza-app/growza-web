'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useAreas } from '../components/SessionProvider';

import { formatMoney, type Scorecard as ScorecardData, type ScorecardLine } from '../lib/api';

export type ScorecardTone = 'good' | 'steady' | 'bad';

/** Within this much of the period before, a figure is "steady", not up or down. */
const STEADY_PCT = 5;

/**
 * The verdict behind the dot (Jira GRW-567 BR-01/02). Returns null when there
 * is nothing to compare with — the line then has no dot, only its number.
 *
 * `lowerIsBetter` is for no-shows, where any rise is bad news and the 5%
 * band does not apply: one more person not turning up is one too many.
 */
export function verdict(line: ScorecardLine, lowerIsBetter = false): ScorecardTone | null {
  if (line.previous === null) return null;
  const diff = line.value - line.previous;
  if (lowerIsBetter) {
    return diff > 0 ? 'bad' : diff < 0 ? 'good' : line.value === 0 ? 'good' : 'steady';
  }
  const pct = line.previous === 0 ? (diff === 0 ? 0 : 100) : (diff / line.previous) * 100;
  return pct > STEADY_PCT ? 'good' : pct < -STEADY_PCT ? 'bad' : 'steady';
}

type LineKey = keyof Omit<ScorecardData, 'vs'>;
const LINES: { key: LineKey; money?: boolean; lowerIsBetter?: boolean }[] = [
  { key: 'money', money: true },
  { key: 'visits' },
  { key: 'newClients' },
  { key: 'cameBack' },
  { key: 'noShows', lowerIsBetter: true },
];

/**
 * Five lines at the top of Overview: a word, a number, a dot and one sentence
 * against the period before. It replaced four tiles with sparklines and a
 * "+18% ↑" — the number an owner who is not a confident reader skipped. No
 * percentage anywhere: money is in rupees and everything else is people.
 */
export function Scorecard({ data }: { data: ScorecardData }) {
  const t = useTranslations('reports.scorecard');
  /*
   * QA 2026-10-26 — absent, not zero. GRW-610's rule, applied to the five lines rather than to the page.
   *
   * A business that takes no bookings has no visits to count and nobody who failed to turn up, so both read
   * a flat 0 with "Same as the week before" beneath them — two of five lines saying nothing, every week,
   * next to three that are telling the owner something true. Money, new clients and came back all hold for
   * a kitchen, which is why the card is worth showing at all.
   */
  const lines = useAreas().bookings ? LINES : LINES.filter((l) => l.key !== 'visits' && l.key !== 'noShows');
  const locale = useLocale();
  const money = (minor: number) => formatMoney(String(minor), 'INR', locale);
  const period = t(`period.${data.vs}`);

  const sentence = (line: ScorecardLine, isMoney: boolean): string => {
    if (line.previous === null) return t('noPrior');
    const diff = line.value - line.previous;
    if (diff === 0) return t('same', { period });
    if (isMoney) return t(diff > 0 ? 'moreMoney' : 'lessMoney', { amount: money(Math.abs(diff)), period });
    return t(diff > 0 ? 'more' : 'fewer', { n: Math.abs(diff), period });
  };

  return (
    <section className="rp-card sc">
      <h2 className="sc-title">{t('title')}</h2>
      <ol className="sc-lines">
        {lines.map(({ key, money: isMoney, lowerIsBetter }) => {
          const line = data[key];
          const tone = verdict(line, lowerIsBetter);
          return (
            <li key={key} className="sc-line">
              <span className="sc-label">{t(`lines.${key}`)}</span>
              <span className="sc-value">{isMoney ? money(line.value) : line.value}</span>
              <span className="sc-note">
                {tone && <span className={`sc-dot sc-dot-${tone}`} role="img" aria-label={t(`tone.${tone}`)} />}
                {sentence(line, Boolean(isMoney))}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
