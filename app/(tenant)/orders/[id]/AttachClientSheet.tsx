'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useNouns } from '../../lib/use-nouns';
import { api, ApiError } from '../../lib/api';
import type { Customer } from '../../lib/api-types';
import { useDialog } from '../../../shared/a11y/useDialog';
import { useScrimDismiss } from '../../../shared/a11y/scrim-dismiss';

/**
 * Jira GRW-613 — "This is a client of ours": the buyer a marketplace named is somebody the shop already knows.
 *
 * The route has existed since GRW-613 and nothing called it. `ui-actions.test.ts` has been saying so — a write the
 * desk is granted and is offered nowhere — from behind a pin that could not install, so nobody read it (review,
 * 2026-10-22). This is the control.
 *
 * Deliberately a SEARCH and not a list of suggestions. BR-02 is that we never match a buyer to a client for them: a
 * marketplace's masked name is the worst possible key to guess on, and a wrong match merges two people's history
 * into one. So the desk types who they think it is, reads the names back, and chooses one.
 *
 * The buyer's own details stay beside the search while it is open, because that is what the desk is matching
 * against — it is not asked to remember the name from the screen underneath.
 */
export function AttachClientSheet({
  orderId,
  buyerName,
  buyerContact,
  locationId,
  onClose,
  onAttached,
}: {
  orderId: string;
  buyerName: string | null;
  buyerContact: string | null;
  /** Jira GRW-392 — a desk is held to its own branch's clients, as every other client read is. */
  locationId: string | null;
  onClose: () => void;
  onAttached: () => void;
}) {
  const t = useTranslations('orders');
  // Restaurant QA 2026-10-24 — Guest at a restaurant, Customer at a shop, Client at a salon.
  const nouns = useNouns();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { onClose });

  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Only the newest answer may land. Typing "Priya" fires several reads and a slow earlier one must not replace the
   * list the desk is looking at — the same rule Home's figures follow.
   */
  const latest = useRef(0);

  useEffect(() => {
    const typed = term.trim();
    if (typed.length < 2) {
      setRows(null);
      setSearching(false);
      return;
    }
    const mine = ++latest.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api
        .customers({ search: typed, limit: 8, location: locationId })
        .then((page) => {
          if (mine !== latest.current) return;
          setRows(page.rows);
          setSearching(false);
        })
        .catch(() => {
          if (mine !== latest.current) return;
          setRows([]);
          setSearching(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term, locationId]);

  const attach = async (customerId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.attachOrderClient(orderId, customerId);
      onAttached();
    } catch (err) {
      // The API's own sentence: "already has a client", "that client is not available", said where it happened.
      setError(err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.message : t('attach.failed', { customer: nouns.customer }));
      setBusy(false);
    }
  };

  // A tap beside the card closes it and presses nothing underneath (owner, 2026-10-28).
  const scrimDismiss = useScrimDismiss(onClose, !busy);
  return (
    <div className="pf-keypad-scrim" {...scrimDismiss}>
      <div ref={ref} className="pf-keypad psz-sheet atc-sheet" role="dialog" aria-modal="true" aria-label={t('attach.title', { customer: nouns.customer })} tabIndex={-1}>
        <div className="pf-keypad-head">
          <span className="pf-keypad-title">{t('attach.title', { customer: nouns.customer })}</span>
          <button type="button" className="pf-keypad-clear" onClick={onClose} disabled={busy}>
            {t('attach.close')}
          </button>
        </div>

        {/* What the desk is matching against, kept in front of them while they type. */}
        <p className="atc-buyer">
          <span className="atc-buyer-name">{buyerName ?? t('list.noName')}</span>
          {buyerContact ? <span className="atc-buyer-contact">{buyerContact}</span> : null}
        </p>

        <label className="atc-field">
          <span className="ci-mini-label">{t('attach.searchLabel', { customers: nouns.customers })}</span>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="words"
            placeholder={t('attach.searchPlaceholder')}
            value={term}
            disabled={busy}
            onChange={(e) => {
              setTerm(e.target.value);
              setError(null);
            }}
          />
        </label>

        {term.trim().length < 2 ? (
          <p className="atc-note">{t('attach.typeMore')}</p>
        ) : searching ? (
          <p className="atc-note" role="status">
            {t('attach.searching')}
          </p>
        ) : rows && rows.length === 0 ? (
          <p className="atc-note">{t('attach.noneFound', { customer: nouns.customer })}</p>
        ) : (
          <ul className="atc-list">
            {(rows ?? []).map((c) => (
              <li key={c.id}>
                <button type="button" className="atc-row" disabled={busy} onClick={() => void attach(c.id)}>
                  <span className="atc-row-name">{c.name ?? t('list.noName')}</span>
                  {c.waPhone ? <span className="atc-row-phone">{c.waPhone}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <p className="atc-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
