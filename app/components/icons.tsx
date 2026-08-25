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

export const IconDots = () => (
  <svg {...base}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
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
