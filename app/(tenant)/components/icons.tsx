/**
 * Inline icons — no icon-font dependency, no external requests.
 *
 * Jira GRW-503 — drawn from Feather (https://feathericons.com), copied in as path data rather than
 * installed: 24x24, 2px round line, so the whole set is one family. The icons Feather has no
 * counterpart for (WhatsApp, Rupee, Flame, Coins, Lightbulb, Palette and a few more) keep their own
 * shape at the same stroke.
 *
 * Feather is MIT licensed, Copyright (c) 2013-2017 Cole Bemis.
 * Permission is hereby granted, free of charge, to use, copy, modify and distribute it, provided this
 * notice is included. The software is provided "as is", without warranty of any kind.
 */
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const IconDashboard = () => (
  <svg {...base}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="21" x2="9" y2="9" />
  </svg>
);

export const IconCalendar = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export const IconAppointments = () => (
  <svg {...base}>
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

export const IconStaff = () => (
  <svg {...base}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconServices = () => (
  <svg {...base}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

export const IconAnalytics = () => (
  <svg {...base}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export const IconChat = () => (
  <svg {...base}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

/** A gift box — an offer is a treat for a client. Ribbon and bow keep it apart from Packages' plain cube. */
export const IconOffers = () => (
  <svg {...base}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
    <path d="M12 8v13" />
    <path d="M12 8H8.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8z" />
    <path d="M12 8h3.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8z" />
  </svg>
);

/** Jira GRW-438 — Packages. Layers, because a package is several services stacked into one visit. */
export const IconPackages = () => (
  <svg {...base}>
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export const IconLightbulb = () => (
  <svg {...base}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v1h6v-1c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3Z" />
  </svg>
);

export const IconNote = () => (
  <svg {...base}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

/* The preview's two device shapes — the package builder drew these as 📱 and 🖥️. */
export const IconDevicePhone = () => (
  <svg {...base}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

export const IconDeviceDesktop = () => (
  <svg {...base}>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

export const IconPhone = () => (
  <svg {...base}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const IconClose = () => (
  <svg {...base}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconChevronRight = () => (
  <svg {...base}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const IconArrowLeft = () => (
  <svg {...base}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export const IconPlus = () => (
  <svg {...base}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/** IconPlus without its upright: the "one fewer" half of a quantity counter. */
export const IconMinus = () => (
  <svg {...base}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/** Feather `share-2` — hand the bill to any app on the phone. */
export const IconShare = () => (
  <svg {...base}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

/** Feather `printer` — print the bill, or save it as a PDF from the print dialog. */
export const IconPrint = () => (
  <svg {...base}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export const IconClock = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

/** Jira GRW-544 — a stopwatch: time elapsed. Feather has none, so this is drawn here at Feather's stroke. */
export const IconStopwatch = () => (
  <svg {...base}>
    <circle cx="12" cy="14" r="8" />
    <line x1="10" y1="2" x2="14" y2="2" />
    <line x1="12" y1="14" x2="15" y2="11" />
  </svg>
);

export const IconSearch = () => (
  <svg {...base}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" />
    <line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);

export const IconUser = () => (
  <svg {...base}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
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
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

export const IconFilter = () => (
  <svg {...base}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
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
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export const IconBell = () => (
  <svg {...base}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export const IconSettings = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconWallet = () => (
  <svg {...base}>
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

export const IconEdit = () => (
  <svg {...base}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

/** "No entry" glyph — used to mark someone unavailable for today. */
export const IconBan = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

export const IconTrash = () => (
  <svg {...base}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const IconShop = () => (
  <svg {...base}>
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export const IconShield = () => (
  <svg {...base}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const IconStar = () => (
  <svg {...base}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export const IconLogout = () => (
  <svg {...base}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

/* ---- Reports (GRW-48) ---- */

export const IconReports = () => (
  <svg {...base}>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

export const IconTrendUp = () => (
  <svg {...base}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

export const IconTrendDown = () => (
  <svg {...base}>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);

export const IconArrowRight = () => (
  <svg {...base}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export const IconRepeat = () => (
  <svg {...base}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const IconFlame = () => (
  <svg {...base}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
  </svg>
);

export const IconAlert = () => (
  <svg {...base}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
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
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

export const IconTarget = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const IconDownload = () => (
  <svg {...base}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const IconRupee = () => (
  <svg {...base}>
    <path d="M6 3h12M6 8h12M9.5 21 6 13h3a5 5 0 0 0 0-10" />
  </svg>
);

export const IconUserCheck = () => (
  <svg {...base}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <polyline points="17 11 19 13 23 9" />
  </svg>
);

export const IconChevronDown = () => (
  <svg {...base}>
    <polyline points="6 9 12 15 18 9" />
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
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

/** Bookings — a calendar with the day marked, not a ticked box. */
export const IconNavBookings = () => (
  <svg {...base}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

/** Clients — two people. A group, which is what the screen is. */
export const IconNavClients = () => (
  <svg {...base}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/** Offers — a price tag. Legible at 23px, which the old gift box was not. */
export const IconNavOffers = () => (
  <svg {...base}>
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

/** Attendance — a person with a tick. Present, not added. */
export const IconNavAttendance = () => (
  <svg {...base}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

/** More — an ellipsis in a circle, so it sits as a shape beside four shapes. */
export const IconNavMore = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

/* Jira GRW-222 — the Home redesign's extra glyphs. Drawn on the same 24px grid
   and 1.8 stroke as the set above, rather than loading the design's Phosphor
   icon font from a CDN: this is an installable PWA, and a Home screen whose
   icons depend on a third-party server is a Home screen that breaks offline. */

export const IconMapPin = () => (
  <svg {...base}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
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

/**
 * Jira GRW-510 — a document with lines: a summary. It was a clock with an arrow ("history"), which said
 * "something happened earlier" and not "here is the day in brief". Drawn from Feather's file-text (MIT,
 * Copyright (c) 2013-2017 Cole Bemis).
 */
export const IconDaySummary = () => (
  <svg {...base}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

export const IconScissors = () => (
  <svg {...base}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

/* ---------- how they paid: the four tiles on Record payment, drawn to the design's mock ---------- */

export const IconPayCash = () => (
  <svg {...base}>
    <rect x="2" y="6" width="20" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);

export const IconPayCard = () => (
  <svg {...base}>
    <rect x="2" y="5" width="20" height="14" rx="3" />
    <path d="M2 10h20" />
  </svg>
);

export const IconPayUpi = () => (
  <svg {...base}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M10.5 18.5h3" />
    <path d="M9 9.5l3-2.5 3 2.5" />
  </svg>
);

export const IconPayOther = () => (
  <svg {...base}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </svg>
);
