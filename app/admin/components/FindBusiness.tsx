'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { Icon, TypeIcon } from '../icons';
import { oklch, typeColor } from '../tokens';
import { useAdminMe } from './AdminMeContext';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-699 — find any business from any admin screen.
 *
 * On a support call the caller gives a name, a phone number or the 8 characters on their business page. Search used
 * to live on the Businesses list only, so every call began with a trip there. ⌘K (Ctrl+K) or the search button in
 * the header opens this from anywhere; Enter opens the first match.
 *
 * Nothing is asked for under 2 characters: one letter matches most of the platform and tells nobody anything.
 */
export const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;
const LIMIT = 8;

interface Match {
  tenantId: string;
  name: string;
  vertical: string;
  status: string;
  ownerPhone: string | null;
}

/** Whether a key press opens the finder: ⌘K on a Mac, Ctrl+K elsewhere. */
export function opensFinder(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
}

export function FindBusiness() {
  const { can } = useAdminMe();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const allowed = can('admin.business.view');
  // Focus moves in, Tab stays inside, Escape closes and focus goes back to what opened it — the shared promise.
  useDialog(dialog, { onClose: () => setOpen(false), active: open });

  useEffect(() => {
    if (!allowed) return;
    const onKey = (e: KeyboardEvent) => {
      if (!opensFinder(e)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowed]);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setMatches(null);
    setError(null);
  }, [open]);

  const trimmed = query.trim();
  useEffect(() => {
    if (!open || trimmed.length < MIN_QUERY) {
      setMatches(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      adminFetch<{ rows: Match[] }>(`/businesses?search=${encodeURIComponent(trimmed)}&pageSize=${LIMIT}`, { signal: controller.signal })
        .then((res) => {
          setMatches(res.rows);
          setActive(0);
          setError(null);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setError(err instanceof AdminApiError ? err.message : 'Could not search. Try again.');
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed]);

  if (!allowed) return null;

  const go = (m: Match) => {
    setOpen(false);
    router.push(`/admin/businesses/${m.tenantId}`);
  };

  return (
    <>
      <button
        type="button"
        className="admin-find-button"
        aria-label="Find a business (⌘K)"
        title="Find a business (⌘K)"
        onClick={() => setOpen(true)}
      >
        <Icon name="search" size={18} />
      </button>
      {open ? (
        <div className="admin-find-scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-label="Find a business" className="admin-find-dialog">
            <div className="admin-find-field">
              <Icon name="search" size={18} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, phone or ID"
                aria-label="Find a business by name, phone or ID"
                aria-controls="admin-find-results"
                aria-activedescendant={matches?.[active] ? `admin-find-${matches[active].tenantId}` : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && matches?.length) {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, matches.length - 1));
                  } else if (e.key === 'ArrowUp' && matches?.length) {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter' && matches?.[active]) {
                    e.preventDefault();
                    go(matches[active]);
                  }
                }}
              />
              <button type="button" className="admin-find-close" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <div id="admin-find-results" role="listbox" aria-label="Businesses found">
              {error ? (
                <p className="admin-find-note" role="alert">
                  {error}
                </p>
              ) : trimmed.length < MIN_QUERY ? (
                <p className="admin-find-note">Type at least {MIN_QUERY} letters or digits.</p>
              ) : matches && matches.length === 0 ? (
                <p className="admin-find-note">No business found for “{trimmed}”.</p>
              ) : (
                matches?.map((m, i) => {
                  const tc = typeColor(m.vertical);
                  return (
                    <div
                      key={m.tenantId}
                      id={`admin-find-${m.tenantId}`}
                      role="option"
                      aria-selected={i === active}
                      className="admin-find-row"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(m)}
                    >
                      <span className="admin-find-icon" style={{ background: tc.bg, color: tc.fg }}>
                        <TypeIcon type={m.vertical} size={16} />
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="admin-find-name">{m.name}</span>
                        <span className="admin-find-sub">
                          {m.vertical} · {m.ownerPhone ?? 'No owner'} · {m.tenantId.slice(0, 8)}
                        </span>
                      </span>
                      <span style={{ color: oklch.textFaint, display: 'flex' }} aria-hidden>
                        <Icon name="chevronRight" size={15} />
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
