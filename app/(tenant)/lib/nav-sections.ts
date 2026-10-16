/**
 * Owner, 2026-10-15 — the sidebar groups what belongs together: Catalogue (Services · Packages · Products ·
 * Offers), Team (Staff · Attendance), and Bookings with Free times under it.
 *
 * A group is one row. Its children are the same routes they always were — nothing is renamed or moved, so every
 * link, the till and the branch routing are unaffected — and they appear under it while one of them is open.
 * Who sees what is still the nav policy's answer, asked of each child: a group a role may reach none of is not
 * drawn, and one it may reach some of opens at the first it may reach.
 */
export interface NavLeaf<I = unknown> {
  href: string;
  label: string;
  icon?: I;
  pill?: string | null;
  className?: string;
}

export interface NavGroup<I = unknown> extends NavLeaf<I> {
  /** Further routes under this row. A group with no `href` of its own opens at its first visible child. */
  children?: NavLeaf<I>[];
}

export interface ResolvedNav<I = unknown> extends NavLeaf<I> {
  children: NavLeaf<I>[];
  /** Every route that makes this row the current one. */
  routes: string[];
  /** The row's own route is a screen the role may open (Bookings), as opposed to a heading that only opens its first child. */
  self: boolean;
}

/** `own` — the group's own route is a screen in its own right (Bookings), not only a heading (Catalogue). */
export function resolveNav<I>(groups: readonly NavGroup<I>[], canSee: (href: string) => boolean, own: (g: NavGroup<I>) => boolean = (g) => g.href !== ''): ResolvedNav<I>[] {
  const out: ResolvedNav<I>[] = [];
  for (const g of groups) {
    const children = (g.children ?? []).filter((c) => canSee(c.href));
    const ownVisible = own(g) && canSee(g.href);
    const href = ownVisible ? g.href : children[0]?.href;
    if (!href) continue;
    out.push({ ...g, href, children, self: ownVisible, routes: [...(own(g) ? [g.href] : []), ...(g.children ?? []).map((c) => c.href)] });
  }
  return out;
}

export const isActive = (pathname: string, route: string): boolean => (route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(`${route}/`));
