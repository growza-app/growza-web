'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, formatMoney, type ServiceAdmin } from '../lib/api';
import { useDialog } from '../../shared/a11y/useDialog';

/**
 * Jira GRW-378 — copy another branch's services into this one.
 *
 * Pick the branch, untick what this branch does not sell, copy. The copies are new rows: a price changed here
 * later never reaches the branch they came from, and the other way round. A name this branch already has is
 * shown as already here and never copied over it — the server skips it too, and says so, in case the list
 * changed in between.
 */
export function CopyFromBranch({
  branchId,
  branches,
  existing,
  onClose,
  onCopied,
}: {
  branchId: string;
  branches: ReadonlyArray<{ id: string; name: string }>;
  /** This branch's services, so names already here are marked rather than offered. */
  existing: ServiceAdmin[];
  onClose: () => void;
  onCopied: () => void;
}) {
  const t = useTranslations('services.copy');
  const tc = useTranslations('common');
  const sources = branches.filter((b) => b.id !== branchId);
  const [from, setFrom] = useState(sources[0]?.id ?? '');
  const [list, setList] = useState<ServiceAdmin[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: string[] } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, { onClose: busy ? undefined : onClose });

  const here = useMemo(() => new Set(existing.map((s) => s.name.trim().toLowerCase())), [existing]);
  const isHere = (s: ServiceAdmin) => here.has(s.name.trim().toLowerCase());

  useEffect(() => {
    if (!from) return;
    let live = true;
    setList(null);
    setError(null);
    api
      .allServices(from)
      .then((rows) => {
        if (!live) return;
        const active = rows.filter((s) => s.active);
        setList(active);
        setPicked(new Set(active.filter((s) => !here.has(s.name.trim().toLowerCase())).map((s) => s.id)));
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : t('loadFailed')));
    return () => {
      live = false;
    };
  }, [from, here, t]);

  const offered = (list ?? []).filter((s) => !isHere(s));
  const allPicked = offered.length > 0 && offered.every((s) => picked.has(s.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      // Everything offered is "copy all" — no id list, so a service added at the source a second ago comes too.
      const ids = allPicked ? undefined : [...picked];
      setResult(await api.copyServicesFromBranch(from, branchId, ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="modal modal-fit copy-branch-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{t('title')}</h3>

        {result ? (
          <div className="modal-body">
            <p className="confirm-body">{t('added', { count: result.added })}</p>
            {result.skipped.length > 0 && (
              <p className="confirm-detail">{t('skipped', { count: result.skipped.length, names: result.skipped.join(', ') })}</p>
            )}
          </div>
        ) : (
          <div className="modal-body">
            <div className="field">
              <label htmlFor="copy-branch-from">{t('from')}</label>
              <select id="copy-branch-from" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy}>
                {sources.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}

            {list === null && !error ? (
              <p className="muted">{t('loading')}</p>
            ) : list && list.length === 0 ? (
              <p className="muted">{t('sourceEmpty')}</p>
            ) : (
              list && (
                <>
                  <label className="copy-branch-all">
                    <input
                      type="checkbox"
                      checked={allPicked}
                      disabled={busy || offered.length === 0}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(offered.map((s) => s.id)))}
                    />
                    <span>{t('all', { count: offered.length })}</span>
                  </label>
                  <ul className="copy-branch-list">
                    {list.map((s) => {
                      const already = isHere(s);
                      return (
                        <li key={s.id} className={already ? 'is-here' : undefined}>
                          <label>
                            <input
                              type="checkbox"
                              checked={!already && picked.has(s.id)}
                              disabled={busy || already}
                              onChange={() => toggle(s.id)}
                            />
                            <span className="copy-branch-name">{s.name}</span>
                            <span className="muted">{already ? t('alreadyHere') : formatMoney(s.priceMinor, s.currency)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="muted copy-branch-note">{t('independent')}</p>
                </>
              )
            )}
          </div>
        )}

        <div className="modal-actions">
          {result ? (
            <button type="button" className="btn" onClick={onCopied}>
              {t('done')}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
                {tc('cancel')}
              </button>
              <button type="button" className="btn" disabled={busy || picked.size === 0} onClick={copy}>
                {busy ? tc('working') : t('copy', { count: allPicked ? offered.length : picked.size })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
