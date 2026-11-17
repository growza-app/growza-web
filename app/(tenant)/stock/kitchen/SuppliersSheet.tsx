'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';
import { api, ApiError } from '../../lib/api';
import type { StockSupplier } from '../../lib/api-types';
import { formatPhone } from '../../lib/format';

/**
 * Jira GRW-738 — who a branch buys from: a name, a 10-digit phone, a GSTIN if they have one, a note. Archived, never deleted — a past stock
 * in still shows who it came from. One sheet, two views: the list, and one supplier's form.
 */
export function SuppliersSheet({ branchId, onClose }: { branchId: string; onClose: () => void }) {
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
  useDialog(sheetRef, { onClose: busy ? undefined : onClose });

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

  const title = editing === 'new' ? t('add') : editing ? t('edit') : t('title');
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
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div ref={sheetRef} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" disabled={busy} onClick={editing ? () => setEditing(null) : onClose}>
            {editing ? t('back') : tk('close')}
          </button>
          <span className="sheet-head-title">{title}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        {editing ? (
          <>
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
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(null)}>
                {tk('cancel')}
              </button>
              <button type="button" className="btn prd-footer-save" disabled={busy} onClick={() => void save()}>
                {busy ? tk('saving') : tk('save')}
              </button>
            </div>
          </>
        ) : (
          <div className="sheet-body prd-form-body">
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
          </div>
        )}
      </div>
    </div>
  );
}
