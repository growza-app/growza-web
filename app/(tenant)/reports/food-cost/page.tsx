import { redirect } from 'next/navigation';
import { guardScreen } from '../../lib/screen-guard';
import { screenTitle } from '../../lib/page-title';

export const dynamic = 'force-dynamic';
export const metadata = screenTitle('Inventory · Reports');

/**
 * Jira GRW-739 — Reports › Food cost lived here. Jira GRW-741 — it is Inventory › Reports now: one screen at one address, so the old one sends
 * you there (the branch and the range kept). The Inventory screen guards itself as well.
 */
export default async function FoodCostMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Asked by the NEW address, so whoever may not open it is sent Home from here as well.
  await guardScreen('/inventory/reports');
  // Every part of the address travels (the branch, the range and its dates), so a saved link opens the same days.
  const kept = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const v of [value].flat()) if (typeof v === 'string') kept.append(key, v);
  const query = kept.toString();
  redirect(query ? `/inventory/reports?${query}` : '/inventory/reports');
}
