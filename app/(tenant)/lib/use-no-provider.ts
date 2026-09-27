import { useLocale, useTranslations } from 'next-intl';

import { useLabel } from '../components/LabelsProvider';
import { nounInSentence, pickNoun } from './nouns';

/**
 * Jira GRW-363 — "No stylist": the choice on Record payment, and the row that choice makes in Home's
 * day summary and in Reports. One phrase (`common.noProvider`) so one meaning keeps one word
 * everywhere it appears.
 *
 * English names the vertical's own noun ("No stylist", "No doctor", "No MUA"). Another language
 * uses its generic word for staff (`nouns.staff`: "कोई स्टाफ़ नहीं") until the verticals carry a noun
 * per language (GRW-315 story 5). The CSV writes the same English through `copy.reports.noProvider`;
 * a test keeps the two equal.
 */
export function useNoProvider(): string {
  const t = useTranslations('common');
  const nouns = useTranslations('nouns');
  const locale = useLocale();
  const provider = pickNoun(locale, nounInSentence(useLabel('provider', 'Staff member')), nouns('staff'));
  return t('noProvider', { provider });
}

/**
 * What stands in for initials on the no-stylist row, on Home and in Reports. It is not a person, so
 * it has no initials: the phrase gave "NS", and "कस" in Hindi, which read as somebody's name.
 */
export const NOBODY_INITIAL = '—';
