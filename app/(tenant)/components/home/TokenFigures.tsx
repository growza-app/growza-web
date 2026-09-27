'use client';

import { useTranslations } from 'next-intl';
import type { TokenFigures as Figures } from '../../lib/home-types';

/**
 * Jira GRW-406 (epic GRW-283) — the counter's tokens as six numbers that add up.
 *
 * Tokens given = waiting + served + left without service + cancelled, and paid is the part of served that is settled.
 * Review round 2: with only given, served, paid and left, a day with somebody still waiting (or a visit cancelled
 * after its token) showed four figures that did not add up, and an owner checking them would think one was wrong.
 *
 * One component for the Day summary and Reports, so the two say the same words in the same order. The figures are
 * the server's (`analytics/tokens.ts`), each a count of token states — never worked out here.
 */
export function TokenFigures({ figures }: { figures: Figures }) {
  const t = useTranslations('tokens');
  const items = [
    { key: 'issued', n: figures.issued, label: t('issued'), tone: 'blue' },
    { key: 'waiting', n: figures.waiting ?? 0, label: t('waiting'), tone: 'amber' },
    { key: 'served', n: figures.served, label: t('served'), tone: 'green' },
    { key: 'paid', n: figures.paid, label: t('paidCount'), tone: 'green' },
    { key: 'left', n: figures.left, label: t('left'), tone: 'rose' },
    { key: 'cancelled', n: figures.cancelled, label: t('cancelledCount'), tone: 'slate' },
  ];
  return (
    <div className="hm-ds-stats tb-figures">
      {items.map((x) => (
        <span key={x.key} className={`hm-ds-stat hm-tone-${x.tone}`}>
          <strong>{x.n}</strong>
          {x.label}
        </span>
      ))}
    </div>
  );
}
