'use client';

import type { RestaurantPointsWaiting } from '../lib/api-types';
import { GuestMessageSheet, sheetLabels } from './GuestMessageSheet';
import { type CustomerWords, usePointsWords } from './customer-words';
import { POINTS, WORTH, pointsFor, pointsNumber, pointsTemplate, rupees, shortDay } from './points-reminder';

/**
 * Owner, 2026-11-27 — remind guests to use their points: one message, then a Send per guest with their own points, worth
 * and expiry. The same sheet as the dish fans list.
 */
export function PointsSheet({
  guests,
  business,
  capPct,
  onClose,
  words = 'restaurant',
}: {
  guests: RestaurantPointsWaiting['rows'];
  business: string | null;
  /** The most of one bill points may pay, in percent — the message says so when it is under 100. */
  capPct: number;
  onClose: () => void;
  /** Owner, 2026-11-28 — guests, or a shop's customers (`customer-words.ts`), and the shop's own reminder line (no emoji). */
  words?: CustomerWords;
}) {
  const t = usePointsWords(words);
  return (
    <GuestMessageSheet
      labels={sheetLabels(t)}
      title={t('sheetTitle')}
      initialText={pointsTemplate(business, words)}
      hint={t('hint', { points: POINTS, worth: WORTH })}
      guests={guests}
      meta={(g) => (
        <>
          {t('worth', { points: pointsNumber(g.points), worth: rupees(g.worthMinor) })}
          {g.expiring ? ` · ${t('expires', { n: pointsNumber(g.expiring.points), date: shortDay(g.expiring.on) })}` : ''}
        </>
      )}
      messageFor={(text, g) => pointsFor(text, g, capPct)}
      onClose={onClose}
    />
  );
}
