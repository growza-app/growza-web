import { useTranslations } from 'next-intl';
import { nationalPhoneProblem } from './phone';

/**
 * Jira GRW-357 — `validateNationalPhone`, in the owner's language.
 *
 * Returns the sentence to show under a phone field, or null when the number is
 * usable. Only for screens inside the dashboard: the sign-in pages have no
 * translation provider and keep `validateNationalPhone`.
 */
export function usePhoneProblem() {
  const t = useTranslations('phone');
  return (raw: string, opts: { required?: boolean } = {}): string | null => {
    const p = nationalPhoneProblem(raw, opts);
    if (!p) return null;
    return p.code === 'moreDigits' || p.code === 'tooMany' ? t(p.code, { count: p.count }) : t(p.code);
  };
}
