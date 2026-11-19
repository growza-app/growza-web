'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError, formatMoney } from '../lib/api';
import type { PurchaseSummary, StockSupplier } from '../lib/api-types';
import { formatDate, formatPhone } from '../lib/format';
import AppLink from '../../shared/AppLink';

/**
 * Jira GRW-738 — who a branch buys from: a name, a 10-digit phone, a GSTIN if they have one, a note. Archived, never deleted — a past stock
 * in still shows who it came from.
 *
 * Jira GRW-741 FR-04 — Inventory › Suppliers: the list is the tab itself (it was a sheet off the Stock screen), and one supplier opens in a
 * sheet with their form and what they have sold us: each stock in from them, newest first, with the day, the bill and what it came to before
 * GST. Only the owner and a manager reach it (the API refuses the read at See).
 */
export function SuppliersPanel({ branchId, backHref }: { branchId: string; backHref?: string }) {
  const t = useTranslations('kitchenStock.suppliers');
  const tk = useTranslations('kitchenStock');
  const [list, setList] = useState<StockSupplier[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<StockSupplier | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', gstin: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeForm = () => setEditing(null);
  useDialog(sheetRef, { onClose: busy ? undefined : closeForm, active: editing !== null });

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setList((await api.suppliers(branchId, showArchived)).suppliers);
    } catch {
      setFailed(true);
    }
  }, [branchId, showArchived]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (s: StockSupplier | 'new') => {
    setEditing(s);
    setError(null);
    setForm(s === 'new' ? { name: '', phone: '', gstin: '', notes: '' } : { name: s.name, phone: s.phone ?? '', gstin: s.gstin ?? '', notes: s.notes ?? '' });
  };

  const save = async (patch?: { archived: boolean }) => {
    if (!editing) return;
    const phone = form.phone.replace(/\D/g, '');
    const gstin = form.gstin.trim().toUpperCase();
    if (!patch) {
      if (!form.name.trim()) return setError({ text: tk('nameNeeded'), field: 'name' });
      if (phone && phone.length !== 10) return setError({ text: t('badPhone'), field: 'phone' });
      if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) return setError({ text: t('badGstin'), field: 'gstin' });
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveSupplier(
        editing === 'new' ? null : editing.id,
        patch ?? {
          ...(editing === 'new' ? { locationId: branchId } : {}),
          name: form.name.trim(),
          phone: phone || null,
          gstin: gstin || null,
          notes: form.notes.trim() || null,
        },
      );
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? { text: err.message, field: err.field } : { text: tk('saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const title = editing === 'new' ? t('add') : t('edit');
  const field = (key: 'name' | 'phone' | 'gstin' | 'notes', props: { label: string; hint?: string; inputMode?: 'tel' | 'text'; max: number; ph?: string }) => (
    <div className="prd-field">
      <label className="prd-field-label" htmlFor={`ks-sup-${key}`}>
        {props.label}
      </label>
      <input
        id={`ks-sup-${key}`}
        className="prd-input ks-field"
        value={form[key]}
        maxLength={props.max}
        inputMode={props.inputMode}
        placeholder={props.ph}
        autoCapitalize={key === 'gstin' ? 'characters' : undefined}
        aria-invalid={error?.field === key || undefined}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      {props.hint ? <span className="ks-hint">{props.hint}</span> : null}
    </div>
  );

  return (
    <div className="ks-body">
      {/* Jira GRW-744 — Suppliers is reached from Stock, not a tab: the way back is said, and its title says where you are. */}
      {backHref ? (
        <div className="inv-sub-head">
          <AppLink className="ks-quiet-link inv-back" href={backHref}>
            ← {tk('tabs.stock')}
          </AppLink>
          <h2 className="inv-section-title">{tk('actions.suppliers')}</h2>
        </div>
      ) : null}
      {failed ? (
        <div role="alert" className="ks-state ks-state-error">
          <p>{t('loadFailed')}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            {tk('retry')}
          </button>
        </div>
      ) : list === null ? (
        <ul className="ks-list" aria-busy="true" aria-label={tk('loading')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="ks-row ks-skel" aria-hidden="true" />
          ))}
        </ul>
      ) : list.length === 0 ? (
        <div className="ks-state ks-empty">
          <strong>{t('empty')}</strong>
          <span>{t('emptyHint')}</span>
        </div>
      ) : (
        <ul className="ks-list">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" className="ks-row ks-row-btn" onClick={() => open(s)}>
                <span className="ks-name">
                  {s.name}
                  <span className="ks-meta">
                    {[s.phone ? formatPhone(s.phone) : null, s.gstin, s.archived ? t('archived') : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ks-pair">
        <button type="button" className="btn btn-ghost" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? t('hideArchived') : t('showArchived')}
        </button>
        <button type="button" className="btn ks-add" onClick={() => open('new')}>
          + {t('add')}
        </button>
      </div>

      {editing ? (
        <div className="modal-backdrop" onClick={busy ? undefined : closeForm}>
          <div ref={sheetRef} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <button type="button" className="sheet-head-cancel" disabled={busy} onClick={closeForm}>
                {tk('close')}
              </button>
              <span className="sheet-head-title">{title}</span>
              <span className="prd-head-spacer" aria-hidden="true" />
            </div>
            <div className="sheet-body prd-form-body">
              {field('name', { label: tk('name'), max: 60, ph: t('namePh') })}
              {field('phone', { label: t('phone'), max: 14, inputMode: 'tel', ph: '98765 43210' })}
              {field('gstin', { label: t('gstin'), max: 15, hint: t('gstinHint') })}
              {field('notes', { label: t('notes'), max: 200 })}
              {error ? (
                <div role="alert" className="sheet-foot sheet-foot-error">
                  {error.text}
                </div>
              ) : null}
              {editing !== 'new' ? <SupplierBought branchId={branchId} supplierId={editing.id} /> : null}
              {editing !== 'new' ? (
                <div className="prd-action-row prd-action-row-danger">
                  <div className="prd-action-copy">
                    <strong>{editing.archived ? t('restore') : t('archive')}</strong>
                    <span>{editing.archived ? t('restoreHint') : t('archiveHint')}</span>
                  </div>
                  <button type="button" className="btn btn-ghost prd-delete-btn" disabled={busy} onClick={() => void save({ archived: !editing.archived })}>
                    {editing.archived ? t('restore') : t('archiveButton')}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="prd-sheet-footer">
              {/* Jira GRW-744 — one Cancel, at the top: the foot is the one thing this sheet is for. */}
              <button type="button" className="btn prd-footer-save" disabled={busy} onClick={() => void save()}>
                {busy ? tk('saving') : tk('save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** FR-04 — what one supplier has sold this branch: their stock ins, newest first, each with what it came to before GST. */
function SupplierBought({ branchId, supplierId }: { branchId: string; supplierId: string }) {
  const t = useTranslations('kitchenStock.suppliers');
  const tp = useTranslations('kitchenStock.purchases');
  const locale = useLocale();
  const [rows, setRows] = useState<PurchaseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .purchases(branchId, 0, supplierId)
      .then((page) => live && setRows(page.purchases))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [branchId, supplierId]);
  return (
    <section className="inv-bought" aria-label={t('bought')}>
      <h3 className="prd-form-sec-title">{t('bought')}</h3>
      {failed ? (
        <p className="ks-hint">{t('boughtFailed')}</p>
      ) : rows === null ? (
        <ul className="ks-list" aria-busy="true">
          <li className="ks-row ks-skel" aria-hidden="true" />
        </ul>
      ) : rows.length === 0 ? (
        <p className="ks-hint">{t('boughtNone')}</p>
      ) : (
        <ul className="ks-list">
          {rows.map((p) => (
            <li key={p.id} className="ks-row">
              <span className="ks-name">
                {formatDate(`${p.boughtOn}T12:00:00Z`, 'UTC', locale)}
                <span className="ks-meta">
                  {p.billNo ? `${p.billNo} · ` : ''}
                  {tp('lines', { n: p.lineCount })}
                  {p.noPrice ? ` · ${tp('noPrice')}` : ''}
                </span>
              </span>
              {typeof p.totalMinor === 'number' ? <span className="ks-amount">{formatMoney(p.totalMinor, 'INR', locale)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
