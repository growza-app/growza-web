import type { Metadata } from 'next';
import { api } from './api';
import { copy } from './copy';

/**
 * Jira GRW-192 — what a screen calls itself in the browser tab.
 *
 * Every screen used to render `<title>Booking Dashboard</title>`, so thirteen
 * tabs looked identical. The layout supplies the template — `%s · Glow Salon`
 * — and these supply the `%s`.
 *
 * ## Why two functions rather than one
 *
 * Half these nouns are the vertical's, not ours. The same screen is Staff to a
 * salon, **Doctors** to a clinic and **Mechanics** to a garage; Clients become
 * **Patients**, Bookings become **Visits**. That is not decoration, it is
 * `ctx.labels` and CLAUDE.md's rule that every dashboard-visible noun comes
 * from it.
 *
 * A static title would have been correct for salon and wrong for every other
 * vertical the moment one shipped — and worse, wrong while the SIDEBAR next to
 * it said the right thing, since the nav already resolves these labels.
 *
 * So: `screenTitle` for the names that never change, `labelledTitle` for the
 * four that do.
 *
 * ## The cost, which was measured rather than assumed
 *
 * `labelledTitle` calls `/me`, and so does the layout that renders around it.
 * That looked like doubling a request on every page load. It does not: React
 * memoises identical `fetch` calls within one render pass, and `cache:
 * 'no-store'` turns off the data cache, not that memoisation. Counted in the
 * API log for a real page load — one `/api/v1/me`, not two.
 */

/** A screen whose name is the same in every vertical. */
export function screenTitle(title: string): Metadata {
  return { title };
}

/** The nouns a vertical renames. Keys match `ctx.labels`. */
type LabelKey = 'appointments' | 'providers' | 'services' | 'customers';

/**
 * A screen the vertical names for us.
 *
 * The fallback is the same `copy.nav.*` string the sidebar falls back to, so a
 * tenant whose labels have not loaded sees the tab and the nav agree rather
 * than disagree.
 */
export async function labelledTitle(key: LabelKey, fallback: string): Promise<Metadata> {
  try {
    const me = await api.me();
    return { title: me.labels?.[key] ?? fallback };
  } catch {
    // A title is never worth failing a page over. The screen itself renders
    // its own error state; this just names the tab something sensible.
    return { title: fallback };
  }
}

/** The sidebar's own fallbacks, so the two cannot drift apart. */
export const TITLE_FALLBACK = {
  appointments: copy.nav.appointments,
  providers: copy.nav.staff,
  services: copy.nav.services,
  customers: copy.nav.customers,
} as const;

/**
 * The home screen, which the layout's `template` cannot reach.
 *
 * Next applies `title.template` to CHILD segments only, and `(tenant)/page.tsx`
 * lives in the same segment as the layout that declares it — so Home rendered
 * "Home" while every other tab read "Bookings · Glow Salon". Found by opening
 * the tabs and reading them, not by reading the docs.
 *
 * `absolute` opts out of the template and spells the whole thing, which is why
 * the business name is repeated here rather than inherited.
 */
export async function rootTitle(name: string): Promise<Metadata> {
  try {
    const me = await api.me();
    const business = me.tenant?.name;
    return { title: { absolute: business ? `${name} · ${business}` : name } };
  } catch {
    return { title: { absolute: name } };
  }
}
