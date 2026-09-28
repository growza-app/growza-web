import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { ReportRowKey } from '../lib/api';
import { useNoProvider } from '../lib/use-no-provider';

/**
 * Jira GRW-363 — a report row's name, in the owner's language.
 *
 * The API sends a code beside the rows whose name it chose ("Came back", "Cash",
 * "Everything else", "Unassigned", "Just once") and keeps their English `label` for the
 * CSV. Those are worded here; a row with no code is something the owner named — a
 * service, a person — and is shown exactly as typed. A code this screen does not know
 * yet (a newer API) shows the API's English rather than a blank.
 *
 * The four payment words and "Walk-in" are the same words Home, the till and the
 * Bookings chips use, and the no-stylist row is the same phrase as the Record payment
 * choice that makes it (`useNoProvider`), so one meaning keeps one word.
 */
export function useRowName(): (row: { key?: ReportRowKey; label: string }) => string {
  const t = useTranslations('reports');
  const pay = useTranslations('chrome');
  const status = useTranslations('status');
  const noProvider = useNoProvider();

  return useCallback(
    (row) => {
      switch (row.key) {
        case undefined:
          return row.label;
        case 'upi':
        case 'card':
        case 'cash':
        case 'other':
          return pay(`pay.${row.key}`);
        case 'walk_in':
          return status('walkIn');
        case 'unassigned':
          return noProvider;
        default:
          return t.has(`rows.${row.key}`) ? t(`rows.${row.key}`) : row.label;
      }
    },
    [t, pay, status, noProvider],
  );
}
