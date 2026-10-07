'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { PageHeader } from '../components/PageHeader';
import { useBranch } from '../components/BranchProvider';
import { SETTINGS_GROUPS } from './nav-data';

/**
 * The header names the screen you are on, not the section it belongs to (design review, 2026-10-07).
 *
 * Every settings route drew the same header: "Settings". On a laptop that was survivable — the list sits
 * beside the form and now marks the open row — but on a phone the list is a screen you have left, so the
 * only thing naming the view was the card heading, 230px down, and the browser tab nobody is looking at.
 *
 * The label comes from the same `nav-data` row the list draws, so the header and the list cannot come to
 * name the same screen differently. The hub itself keeps "Settings": there the list IS the screen.
 *
 * A client component for one reason: a layout cannot read which child route is open, and `usePathname` can.
 * `PageHeader` holds no server-only code, so rendering it from here costs nothing.
 */
export function SettingsHeader({ sectionTitle, subtitle }: { sectionTitle: string; subtitle: string }) {
  const t = useTranslations('settingsHub');
  const here = usePathname();
  // The same label the list draws, multi-branch swap included ("Business profile" becomes "Business name and
  // logo" once there is more than one), so the two can never name one screen differently.
  const multi = useBranch().branches.length > 1;
  const row = SETTINGS_GROUPS.flatMap((g) => g.rows).find(
    (r) => r.href && (here === r.href || here.startsWith(`${r.href}/`)),
  );
  const key = row ? (multi && row.multiBranchKey ? row.multiBranchKey : row.key) : null;
  return <PageHeader title={key ? t(`rows.${key}.label`) : sectionTitle} subtitle={subtitle} />;
}
