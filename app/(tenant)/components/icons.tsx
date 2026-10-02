/** Inline nav icons — no icon-font dependency, no external requests. */
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const IconDashboard = () => (
  <svg {...base}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const IconCalendar = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);

export const IconAppointments = () => (
  <svg {...base}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconStaff = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0-1.5-5.6M18 20a5.5 5.5 0 0 0-2-4.3" />
  </svg>
);

export const IconServices = () => (
  <svg {...base}>
    <path d="M4 7h16M4 12h11M4 17h7" />
  </svg>
);

export const IconAnalytics = () => (
  <svg {...base}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const IconChat = () => (
  <svg {...base}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  </svg>
);

export const IconOffers = () => (
  <svg {...base}>
    <path d="m12 2 3 5-3 3-3-3 3-5Z" />
    <path d="M3 10h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3ZM5 15v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    <path d="M12 15v7" />
  </svg>
);

/** Jira GRW-438 — Packages. Layers, because a package is several services stacked into one visit. */
export const IconPackages = () => (
  <svg {...base}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);

export const IconPhone = () => (
  <svg {...base}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
  </svg>
);

export const IconWhatsApp = () => (
  <svg {...base}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    <path d="M9.5 9.3c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3 0 .6a6 6 0 0 0 2.6 2.2c.3.1.4 0 .5-.1l.6-.7c.2-.2.3-.1.5-.1l1.6.8c.2.1.4.2.4.4a1.7 1.7 0 0 1-1.2 1.6c-.5.1-1.2.2-3.5-.8a8.4 8.4 0 0 1-3.4-3.4c-.8-1.4-.7-2.2-.6-2.6a2 2 0 0 1 .1-.7Z" />
  </svg>
);

export const IconCheck = () => (
  <svg {...base}>
    <path d="m4 12.5 5 5L20 6.5" />
  </svg>
);

export const IconClose = () => (
  <svg {...base}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconChevronRight = () => (
  <svg {...base}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const IconArrowLeft = () => (
  <svg {...base}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconClock = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 1.9" />
  </svg>
);

export const IconSearch = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconMoveTime = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
    <path d="M15 15h3v3" />
    <path d="M18 15a3.2 3.2 0 1 1-2.6-1.4" />
  </svg>
);

export const IconUserPlus = () => (
  <svg {...base}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M18 8v6M15 11h6" />
  </svg>
);

export const IconUser = () => (
  <svg {...base}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);

export const IconCalendarPlus = () => (
  <svg {...base}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
    <path d="M12 14v5M9.5 16.5h5" />
  </svg>
);

export const IconGrid = () => (
  <svg {...base}>
    <rect x="3" y="3" width="8" height="8" rx="1.6" />
    <rect x="13" y="3" width="8" height="8" rx="1.6" />
    <rect x="3" y="13" width="8" height="8" rx="1.6" />
    <rect x="13" y="13" width="8" height="8" rx="1.6" />
  </svg>
);

export const IconFilter = () => (
  <svg {...base}>
    <path d="M3 5h18l-7 8v5.5l-4 2V13z" />
  </svg>
);

/** Two arrows, one up one down — the usual "change the order" mark. */
export const IconSort = () => (
  <svg {...base}>
    <path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3" />
  </svg>
);

export const IconMenu = () => (
  <svg {...base}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);

export const IconBell = () => (
  <svg {...base}>
    <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

export const IconSettings = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export const IconWallet = () => (
  <svg {...base}>
    <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
    <path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    <path d="M21 14h-4a2 2 0 0 1 0-4h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1Z" />
  </svg>
);

export const IconEdit = () => (
  <svg {...base}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** "No entry" glyph — used to mark someone unavailable for today. */
export const IconBan = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.5 5.5 13 13" />
  </svg>
);

export const IconTrash = () => (
  <svg {...base}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconShop = () => (
  <svg {...base}>
    <path d="M3 9l1.5-5h15L21 9" />
    <path d="M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
    <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
    <path d="M10 20v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
  </svg>
);

export const IconShield = () => (
  <svg {...base}>
    <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconPalette = () => (
  <svg {...base}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2a2 2 0 0 1 2-2h1.5A3.5 3.5 0 0 0 21 13.5c0-5.8-4.2-10.5-9-10.5Z" />
    <circle cx="7.5" cy="12" r="1.3" />
    <circle cx="9" cy="8" r="1.3" />
    <circle cx="14" cy="7.5" r="1.3" />
    <circle cx="17" cy="11" r="1.3" />
  </svg>
);

export const IconLock = () => (
  <svg {...base}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const IconStar = () => (
  <svg {...base}>
    <path d="m12 3 2.6 5.7 6.2.6-4.7 4.2 1.4 6.1L12 16.6l-5.5 3 1.4-6.1-4.7-4.2 6.2-.6Z" />
  </svg>
);

export const IconLogout = () => (
  <svg {...base}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
  </svg>
);

/* ---- Reports (GRW-48) ---- */

export const IconReports = () => (
  <svg {...base}>
    <path d="M3 3v18h18" />
    <rect x="7" y="10" width="3" height="8" rx="1" />
    <rect x="12" y="6" width="3" height="12" rx="1" />
    <rect x="17" y="13" width="3" height="5" rx="1" />
  </svg>
);

export const IconTrendUp = () => (
  <svg {...base}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

export const IconTrendDown = () => (
  <svg {...base}>
    <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
    <polyline points="16 17 22 17 22 11" />
  </svg>
);

export const IconArrowRight = () => (
  <svg {...base}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export const IconRepeat = () => (
  <svg {...base}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

export const IconFlame = () => (
  <svg {...base}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
  </svg>
);

export const IconAlert = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </svg>
);

export const IconCoins = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" />
  </svg>
);

export const IconPercent = () => (
  <svg {...base}>
    <line x1="19" x2="5" y1="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

export const IconTarget = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </svg>
);

export const IconDownload = () => (
  <svg {...base}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
);

export const IconRupee = () => (
  <svg {...base}>
    <path d="M6 3h12M6 8h12M9.5 21 6 13h3a5 5 0 0 0 0-10" />
  </svg>
);

export const IconUserCheck = () => (
  <svg {...base}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </svg>
);

export const IconChevronDown = () => (
  <svg {...base}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/* ---------- the tab bar's own set (Jira GRW-199) ---------- */

/**
 * Five icons drawn as one family, replacing five borrowed from elsewhere.
 *
 * The old bar reused whatever was nearest: a four-square grid for Home (that
 * is an "apps" icon, not a home), a ticked box for Bookings (that reads
 * "done", not "diary"), and — the one that actually misled — `IconUserPlus`
 * for Clients, a person with a PLUS beside them, which every other product on
 * the phone uses to mean ADD a person. A tab that says "add" and navigates is
 * the icon telling one story and the tap telling another.
 *
 * Drawn on one 24px grid at one stroke weight, with the same rounded joins, so
 * five glyphs at 23px read as a set rather than as five decisions.
 */

/** Home — a house. The one metaphor nobody has to learn. */
export const IconNavHome = () => (
  <svg {...base}>
    <path d="M3.5 10.2 12 3.5l8.5 6.7" />
    <path d="M5.5 9.2V19a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.2" />
  </svg>
);

/** Bookings — a calendar with the day marked, not a ticked box. */
export const IconNavBookings = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.75h17M8 3.5v3M16 3.5v3" />
    <circle cx="12" cy="14.75" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

/** Clients — two people. A group, which is what the screen is. */
export const IconNavClients = () => (
  <svg {...base}>
    <circle cx="9.5" cy="8.5" r="3.2" />
    <path d="M3.5 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
    <path d="M16.5 6.4a3.2 3.2 0 0 1 0 6.1M17.8 14.9c1.7.6 2.7 2.1 2.7 4.2" />
  </svg>
);

/** Offers — a price tag. Legible at 23px, which the old gift box was not. */
export const IconNavOffers = () => (
  <svg {...base}>
    <path d="M11.6 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.4a2 2 0 0 1-.6 1.4l-6.6 6.6a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8l6.7-6.6a2 2 0 0 1 1.4-.5Z" />
    <circle cx="16" cy="8" r="1.5" />
  </svg>
);

/** Attendance — a person with a tick. Present, not added. */
export const IconNavAttendance = () => (
  <svg {...base}>
    <circle cx="10" cy="8" r="3.4" />
    <path d="M3.8 20c0-3.4 2.8-5.5 6.2-5.5 1 0 2 .2 2.8.6" />
    <path d="m15 17.5 2 2 4-4" />
  </svg>
);

/** More — an ellipsis in a circle, so it sits as a shape beside four shapes. */
export const IconNavMore = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="8.6" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

/* Jira GRW-222 — the Home redesign's extra glyphs. Drawn on the same 24px grid
   and 1.8 stroke as the set above, rather than loading the design's Phosphor
   icon font from a CDN: this is an installable PWA, and a Home screen whose
   icons depend on a third-party server is a Home screen that breaks offline. */

export const IconMapPin = () => (
  <svg {...base}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

export const IconReceipt = () => (
  <svg {...base}>
    <path d="M6 3v18l2-1.2 2 1.2 2-1.2 2 1.2 2-1.2 2 1.2V3l-2 1.2L14 3l-2 1.2L10 3 8 4.2Z" />
    <path d="M9 9h6M9 13h4" />
  </svg>
);

export const IconClipboardCheck = () => (
  <svg {...base}>
    <rect x="4.5" y="4.5" width="15" height="16.5" rx="3.5" />
    <path d="M9 3.2h6a1.3 1.3 0 0 1 1.3 1.3v.9A1.3 1.3 0 0 1 15 6.7H9a1.3 1.3 0 0 1-1.3-1.3v-.9A1.3 1.3 0 0 1 9 3.2ZM9 13.4l2 2 4.2-4.2" />
  </svg>
);

export const IconDaySummary = () => (
  <svg {...base}>
    <path d="M12 3a9 9 0 1 0 9 9" />
    <path d="M12 7v5l3.5 2M16.5 3.6A9 9 0 0 1 20.4 7.5" />
  </svg>
);

export const IconScissors = () => (
  <svg {...base}>
    <circle cx="6" cy="6" r="2.8" />
    <circle cx="6" cy="18" r="2.8" />
    <path d="M20 4 8.2 15.8M14.5 14.5 20 20M8.2 8.2 12 12" />
  </svg>
);
