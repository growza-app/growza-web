'use client';

import { useTranslations } from 'next-intl';
import { IconSearch } from './icons';
import { useAreas, useLive, useMayUse } from './SessionProvider';
import { gridCanSee } from '../lib/nav-policy';
import { useNouns } from '../lib/use-nouns';

/**
 * Jira GRW-409 · GRW-319 — the header's search, for the people it can answer.
 *
 * `GET /api/v1/search` is the owner's (13-permission-matrix: search crosses
 * every client and every booking). It was drawn on every screen for every
 * role, so a receptionist or a stylist tapped it and got "forbidden". Their way
 * to find somebody is the Clients list (`/customers?search=`, GRW-199) — the
 * front desk's Home already has a "Find a client" tile that goes there.
 *
 * One component for both shapes the header draws it in: the icon on every
 * screen and Home's wide pill. Two copies of the link are how one of them gets
 * gated and the other does not.
 *
 * Jira GRW-448 — it says what it finds. A magnifier in the header beside a screen that has its own search box
 * reads as "search this screen", and the owner tapped it on Packages and was asked for a name, a phone number
 * or a booking ID. It only ever finds clients and bookings, so that is what it is called now, in its label and
 * on Home's pill: "Search anything" was never true — it cannot find a service, a package or an offer.
 */
export function HeaderSearch({ wide = false }: { wide?: boolean }) {
  const t = useTranslations('search');
  const areas = useAreas();
  // Jira GRW-74 — a role holder finds clients only if their role opens Clients; the fixed-role rule is not asked of them.
  const mayUseSearch = useMayUse('search') && (!areas.pages || gridCanSee('/search', areas.pages));
  // Jira GRW-556 — it finds clients and bookings, and a business being set up has neither.
  const live = useLive();
  // Restaurant QA 2026-10-24 — a shop finds its own people: "Find a guest" at a restaurant, "Find a customer" at a shop.
  const { customer } = useNouns();
  if (!mayUseSearch || !live) return null;
  const label = areas.bookings === false ? t('shopTitle', { customer }) : t('title');
  const prompt = areas.bookings === false ? t('shopPrompt', { customer }) : t('prompt');
  return (
    <a className={`hdr-search ${wide ? 'hdr-search-wide' : ''}`} href="/search" aria-label={label}>
      <IconSearch />
      {wide && <span>{prompt}</span>}
    </a>
  );
}
