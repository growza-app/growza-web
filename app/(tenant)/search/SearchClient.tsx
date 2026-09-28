'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatDate } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { api, formatTime, type SearchResult } from '../lib/api';
import { initials, statusChip } from '../lib/appointment-display';
import { bookingRef, dialable } from '../components/BookingSheet';
import { ClientProfileCard } from '../components/ClientProfileCard';
import { IconArrowLeft, IconClose, IconPhone, IconSearch } from '../components/icons';

const EMPTY: SearchResult = { customers: [], bookings: [] };

/**
 * Jira GRW-307 — a booking's own page is the Bookings screen on its day with the sheet
 * open. The day is the salon's, not the browser's: a 10:30 pm booking belongs to the
 * date the salon calls it, wherever the phone thinks it is.
 */
function bookingHref(id: string, startAt: string, timezone: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(startAt));
  return `/appointments?date=${day}&open=${id}`;
}

/** Same field matches a name, any part of a phone number, or a booking reference — the backend decides which. */
/** `showBranch` — Jira GRW-393: at a business with several branches, each row says whose client or visit it is. */
export function SearchClient({ timezone, showBranch = false }: { timezone: string; showBranch?: boolean }) {
  const locale = useLocale();
  const t = useTranslations('search');
  const ts = useTranslations('status');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    // Debounced so typing a phone number doesn't fire a request per digit.
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .search(term)
        .then((r) => {
          if (!cancelled) setResults(r);
        })
        .catch(() => {
          if (!cancelled) setResults(EMPTY);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const term = q.trim();
  const nothing = term.length >= 2 && !loading && results.customers.length === 0 && results.bookings.length === 0;

  return (
    <>
      {/*
        Jira GRW-30 — Search was the only tenant screen with no header at all.

        No title, no notification bell, no account menu: a back arrow inside
        the page body was the whole of its chrome. That was survivable while
        the only way in was Home's search pill, which is a back-and-forth. Now
        that every screen's header offers search, this is somewhere people
        arrive from anywhere — and arriving somewhere that has lost the app's
        navigation reads as having left the app.

        Jira GRW-307 — the header's search button is left out HERE. It used to be
        kept on the argument that a control which reloads the screen you are on
        beats one that vanishes; in practice it was a second, dead search icon
        beside a screen that is one big search box, and it read as broken. Every
        other screen still has it.
      */}
      <PageHeader title={t('title')} hideSearch />
      <div className="page-body">
        <div className="srch-bar-row">
          <a className="icon-btn" href="/" aria-label={t('back')}>
            <IconArrowLeft />
          </a>
          <div className="search-bar" style={{ flex: 1 }}>
            <IconSearch />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('placeholder')}
              aria-label={t('placeholder')}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label={t('clear')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, display: 'grid' }}
              >
                <IconClose />
              </button>
            )}
          </div>
        </div>

        {term.length < 2 && <div className="empty">{t('hint')}</div>}
        {nothing && <div className="empty">{t('nothing')}</div>}

        {results.customers.length > 0 && (
          <>
            <div className="sec-label">{t('customers')}</div>
            <div className="card">
              {results.customers.map((c) => (
                <div className="res-row" key={c.id}>
                  {/* Jira GRW-307 — the client, one tap away: opens their card (visits, bookings,
                      call, edit) where you are, the same card the Clients screen opens. */}
                  <button type="button" className="res-main" onClick={() => setOpenClientId(c.id)}>
                    <div className="avatar">{initials(c.name)}</div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontWeight: 620, fontSize: 14.5 }}>
                        {c.name ?? t('unknown')}
                        {showBranch ? <span className="chip cust-branch-chip">{c.branchName}</span> : null}
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {c.phone ? `${c.phone} · ` : ''}
                        {t('visits', { count: c.visitCount })}
                      </div>
                    </div>
                  </button>
                  {/* GRW-199 — no number, no call button. */}
                  {c.phone && (
                    <a className="call" href={`tel:${dialable(c.phone)}`} aria-label={t('call', { name: c.name ?? t('customer') })}>
                      <IconPhone />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {results.bookings.length > 0 && (
          <>
            <div className="sec-label">{t('bookings')}</div>
            <div className="card">
              {results.bookings.map((b) => (
                <a className="res-row res-link" key={b.id} href={bookingHref(b.id, b.startAt, timezone)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 620, fontSize: 14 }}>
                      {formatDate(b.startAt, timezone, locale)}{' '}
                      · {formatTime(b.startAt, timezone)}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {b.customerName ?? t('unknown')} · {b.serviceName}
                      {b.providerName ? ` · ${b.providerName}` : ''}
                      {showBranch ? ` · ${b.branchName}` : ''}
                    </div>
                  </div>
                  {/* Jira GRW-307 — what became of the booking. Without it a cancelled, a
                      not-yet-marked and a done booking all read as a service the client
                      had, beside a visit count that only counts the done ones. */}
                  <div className="res-side">
                    <span className={`chip ${statusChip(b).cls}`}>{ts(statusChip(b).key)}</span>
                    <span className="ref">{bookingRef(b.id)}</span>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
      {openClientId && <ClientProfileCard clientId={openClientId} onClose={() => setOpenClientId(null)} />}
    </>
  );
}
