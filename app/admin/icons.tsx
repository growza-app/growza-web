/**
 * The admin icon set, ported verbatim from Admin.dc.html's ICONS map.
 *
 * Kept as raw path strings rendered via dangerouslySetInnerHTML, exactly as
 * the design canvas did — the content is a fixed internal set, never user
 * input, so this is the same trust boundary as any other hardcoded SVG.
 */
// GRW-171 — no `Record<string, string>` annotation.
//
// It threw away every key, so `IconName = keyof typeof PATHS` resolved to
// plain `string` and the union this file exists to provide was not a union at
// all. Under noUncheckedIndexedAccess it also made PATHS.businesses — a key
// that demonstrably exists — `string | undefined`, which is how it was found.
const PATHS = {
  dashboard: '<path d="M3 3v18h18"/><path d="M7 15l3-4 3 2 5-7"/>',
  // GRW-274 — a "not settled yet" KPI card (Provisioning). Not in the
  // original Admin.dc.html canvas, same convention as `logout`'s own note.
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  businesses: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 8.5a3 3 0 0 1 0 5M18 20a5.5 5.5 0 0 0-3-4.9"/>',
  roles: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  plans: '<path d="M4 7h16M4 7l1-3h14l1 3M4 7v13h16V7"/><path d="M9 12h6"/>',
  subs: '<path d="M3 5h18v14H3z"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  payments: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
  invoices: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
  usage: '<path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M12 3v9l6-6"/>',
  flags: '<path d="M4 21V4h11l-1.5 4L15 12H4"/>',
  impersonate: '<path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5Z"/><circle cx="12" cy="10" r="2"/>',
  audit: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.2-1.3L14 2h-4l-.3 2.1a7 7 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.3l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.2 1.3L10 22h4l.3-2.1a7 7 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12Z"/>',
  money: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/>',
  alert:
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  // GRW-296 — the entitlement editor's per-field tooltip trigger. Not in the
  // original Admin.dc.html canvas, same convention as `clock`'s own note.
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  salonT: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
  garageT: '<path d="M5 17h14M6 17V9l6-4 6 4v8"/><circle cx="8.5" cy="13" r="1"/><circle cx="15.5" cy="13" r="1"/>',
  dentalT: '<path d="M12 5.5C10 4 7 4 6 6.5c-1 2.5 0 6 1 9 .5 1.5 1.5 2 2-.5.5-2.5 1-3 3-3s2.5.5 3 3c.5 2.5 1.5 2 2 .5 1-3 2-6.5 1-9C17 4 14 4 12 5.5Z"/>',
  spaT: '<path d="M12 21c4-2 7-5.5 7-9.5C19 8 16.5 6 14 8c-.8.6-1.5 1.6-2 2.5-.5-.9-1.2-1.9-2-2.5C7.5 6 5 8 5 11.5 5 15.5 8 19 12 21Z"/>',
  clinicT: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M12 9v6M9 12h6"/>',
  fitnessT: '<path d="M6.5 6.5 17.5 17.5M4 8l2-2M8 4 6 6M16 20l2-2M20 16l-2 2"/>',
  // Not in the original Admin.dc.html canvas — added for GRW-93's sign-out
  // control, which the static design never depicted. Same Lucide-style path
  // convention as the rest of this set (log-out).
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 19 }: { name: IconName | string; size?: number }) {
  // GRW-171 — `name` is widened to string for callers that build it
  // dynamically, so the lookup is genuinely optional. The fallback is a known
  // key and is annotated as such, rather than asserted away.
  const d: string = (PATHS as Record<string, string | undefined>)[name] ?? PATHS.businesses;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

const TYPE_ICON: Record<string, IconName> = {
  Salon: 'salonT',
  Garage: 'garageT',
  Dental: 'dentalT',
  Spa: 'spaT',
  Clinic: 'clinicT',
  Fitness: 'fitnessT',
};

export function TypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  return <Icon name={TYPE_ICON[type] ?? 'businesses'} size={size} />;
}
