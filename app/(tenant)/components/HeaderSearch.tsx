'use client';

import { useTranslations } from 'next-intl';
import { IconSearch } from './icons';
import { useMayUse } from './SessionProvider';

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
 */
export function HeaderSearch({ wide = false }: { wide?: boolean }) {
  const t = useTranslations('search');
  if (!useMayUse('search')) return null;
  return (
    <a className={`hdr-search ${wide ? 'hdr-search-wide' : ''}`} href="/search" aria-label={t('title')}>
      <IconSearch />
      {wide && <span>{t('prompt')}</span>}
    </a>
  );
}
