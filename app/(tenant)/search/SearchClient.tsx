'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { api, formatTime, type SearchResult } from '../lib/api';
import { copy } from '../lib/copy';
import { initials, statusChip } from '../lib/appointment-display';
import { bookingRef, dialable } from '../components/BookingSheet';
import { IconArrowLeft, IconClose, IconPhone, IconSearch } from '../components/icons';

const EMPTY: SearchResult = { customers: [], bookings: [] };

/** Same field matches a name, any part of a phone number, or a booking reference — the backend decides which. */
export function SearchClient({ timezone }: { timezone: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
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

        The header's own search control is deliberately still here. It points
        at this page, and a control that reloads the screen you are on is
        better than one that vanishes on exactly the screen it is about.
      */}
      <PageHeader title={copy.search.title} />
      <div className="page-body">
        <div className="srch-bar-row">
          <a className="icon-btn" href="/" aria-label="Back">
            <IconArrowLeft />
          </a>
          <div className="search-bar" style={{ flex: 1 }}>
            <IconSearch />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={copy.search.placeholder}
              aria-label={copy.search.placeholder}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Clear"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, display: 'grid' }}
              >
                <IconClose />
              </button>
            )}
          </div>
        </div>

        {term.length < 2 && <div className="empty">{copy.search.hint}</div>}
        {nothing && <div className="empty">{copy.search.nothing}</div>}

        {results.customers.length > 0 && (
          <>
            <div className="sec-label">{copy.search.customers}</div>
            <div className="card">
              {results.customers.map((c) => (
                <div className="res-row" key={c.id}>
                  <div className="avatar">{initials(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 620, fontSize: 14.5 }}>{c.name ?? 'Unknown'}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {c.phone ? `${c.phone} · ` : ''}
                      {copy.search.visits(c.visitCount)}
                    </div>
                  </div>
                  {/* GRW-199 — no number, no call button. */}
                  {c.phone && (
                    <a className="call" href={`tel:${dialable(c.phone)}`} aria-label={`Call ${c.name ?? 'customer'}`}>
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
            <div className="sec-label">{copy.search.bookings}</div>
            <div className="card">
              {results.bookings.map((b) => (
                <div className="res-row" key={b.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 620, fontSize: 14 }}>
                      {formatDate(b.startAt, timezone)}{' '}
                      · {formatTime(b.startAt, timezone)}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {b.customerName ?? 'Unknown'} · {b.serviceName}
                      {b.providerName ? ` · ${b.providerName}` : ''}
                    </div>
                  </div>
                  {/* Jira GRW-307 — what became of the booking. Without it a cancelled, a
                      not-yet-marked and a done booking all read as a service the client
                      had, beside a visit count that only counts the done ones. */}
                  <div className="res-side">
                    <span className={`chip ${statusChip(b).cls}`}>{statusChip(b).text}</span>
                    <span className="ref">{bookingRef(b.id)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
