'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialog } from '../../shared/a11y/useDialog';
import { api, ApiError, formatMoney } from '../lib/api';
import type { PurchaseInput, PurchaseLineInput, RememberedPack, StockMaterial, StockSupplier } from '../lib/api-types';
import { formatDate } from '../lib/format';
import { amount, businessToday, packQty, parseAmount, parseRupees, rupeesText, unitWord } from '../lib/kitchen-units';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useSession } from '../components/SessionProvider';
import { IconTrash } from '../components/icons';

/** One line as typed. Loose: a quantity and a price per unit. In packs: what a pack is, how many, and a price per pack. */
interface Draft {
  key: string;
  id?: string;
  materialId: string;
  packed: boolean;
  packLabel: string;
  packSize: string;
  packs: string;
  price: string;
}

let nextKey = 0;
const keyOf = () => `l${++nextKey}`;

/**
 * Jira GRW-738 — a stock in: who from, when, the bill number, and the lines — each an item, loose or in packs ("Eggs — tray of 30 × 2"),
 * and a price before GST. The pack an item last came in from this supplier is filled in for you. GST on the bill is typed once, at the
 * foot, and never enters the cost (BR-05). The bill's photo goes up after the save, so a failed upload never costs the stock in.
 *
 * Opened on a past stock in, the same sheet corrects it: the API writes the difference as "corrected" and replays the cost (FR-05).
 */
export function StockInSheet({
  branchId,
  materials,
  purchaseId,
  onClose,
  onDone,
}: {
  branchId: string;
  materials: StockMaterial[];
  purchaseId: string | null;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const t = useTranslations('kitchenStock.buy');
  const tk = useTranslations('kitchenStock');
  const locale = useLocale();
  const timezone = useSession()?.timezone;
  const today = businessToday(timezone);
  const [suppliers, setSuppliers] = useState<StockSupplier[] | null>(null);
  const [packs, setPacks] = useState<RememberedPack[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(purchaseId === null);
  const [supplierId, setSupplierId] = useState('');
  const [boughtOn, setBoughtOn] = useState(today);
  const [billNo, setBillNo] = useState('');
  const [gst, setGst] = useState('');
  const [lines, setLines] = useState<Draft[]>([]);
  const [find, setFind] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [dupAt, setDupAt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose: busy || confirmDelete ? undefined : onClose });

  // An item archived since this stock in still shows on it, by the name and unit the stock in carries.
  const [onBill, setOnBill] = useState<Array<Pick<StockMaterial, 'id' | 'name' | 'unit'>>>([]);
  const byId = useMemo(
    () => new Map<string, Pick<StockMaterial, 'id' | 'name' | 'unit'>>([...onBill.map((m) => [m.id, m] as const), ...materials.map((m) => [m.id, m] as const)]),
    [materials, onBill],
  );

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = await api.suppliers(branchId);
        if (!live) return;
        setSuppliers(s.suppliers);
        setPacks(s.packs);
        if (purchaseId) {
          const { purchase: p } = await api.purchase(purchaseId);
          if (!live) return;
          setSupplierId(p.supplierId ?? '');
          setBoughtOn(p.boughtOn);
          setBillNo(p.billNo ?? '');
          setGst(typeof p.gstMinor === 'number' ? rupeesText(p.gstMinor) : '');
          setPhotoUrl(p.photoUrl);
          setOnBill(p.lines.map((l) => ({ id: l.materialId, name: l.name, unit: l.unit })));
          setLines(
            p.lines.map((l) => ({
              key: keyOf(),
              id: l.id,
              materialId: l.materialId,
              packed: l.packSize !== 1000 || l.packLabel !== null,
              packLabel: l.packLabel ?? '',
              packSize: amount(l.packSize),
              packs: amount(l.packs),
              price: typeof l.priceMinor === 'number' ? rupeesText(l.priceMinor) : '',
            })),
          );
          setLoaded(true);
        }
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [branchId, purchaseId]);

  const remembered = (materialId: string): RememberedPack | undefined =>
    packs.find((p) => p.materialId === materialId && p.supplierId === (supplierId || null));

  const add = (m: StockMaterial) => {
    const pack = remembered(m.id);
    setLines((ls) => [
      ...ls,
      {
        key: keyOf(),
        materialId: m.id,
        packed: Boolean(pack),
        packLabel: pack?.packLabel ?? '',
        packSize: pack ? amount(pack.packSize) : '',
        packs: '',
        price: '',
      },
    ]);
    setFind('');
  };
  const change = (key: string, patch: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** A line as the API takes it, or why it cannot be sent. */
  const parse = (d: Draft): { line: PurchaseLineInput; qty: number; totalMinor: number | null } | { bad: string } => {
    const m = byId.get(d.materialId);
    const name = m?.name ?? '';
    const unit = m?.unit ?? 'kg';
    const size = d.packed ? parseAmount(d.packSize, unit) : 1000;
    const count = parseAmount(d.packs, unit);
    if (size === null || count === null) return { bad: `${name}: ${tk('badQty')}` };
    const price = d.price.trim() === '' ? null : parseRupees(d.price);
    if (price === null && d.price.trim() !== '') return { bad: `${name}: ${t('badPrice')}` };
    const qty = packQty(size, count);
    if (qty <= 0) return { bad: `${name}: ${tk('badQty')}` };
    return {
      line: {
        ...(d.id ? { id: d.id } : {}),
        materialId: d.materialId,
        packSize: size,
        packLabel: d.packed ? d.packLabel.trim() || null : null,
        packs: count,
        priceMinor: price,
      },
      qty,
      totalMinor: price === null ? null : Math.round((price * count) / 1000),
    };
  };

  const parsed = lines.map(parse);
  const total = parsed.reduce((n, p) => n + ('line' in p && p.totalMinor !== null ? p.totalMinor : 0), 0);
  const gstMinor = gst.trim() === '' ? null : parseRupees(gst);

  const shownFind = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [];
    return materials.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [find, materials]);

  const save = async (anyway = false) => {
    if (lines.length === 0) return setError({ text: t('needLine'), field: 'lines' });
    const bad = parsed.find((p): p is { bad: string } => 'bad' in p);
    if (bad) return setError({ text: bad.bad, field: 'lines' });
    if (gstMinor === null && gst.trim() !== '') return setError({ text: t('badPrice'), field: 'gst' });
    if (!boughtOn || boughtOn > today) return setError({ text: t('futureDate'), field: 'boughtOn' });
    const body: PurchaseInput = {
      ...(purchaseId ? {} : { locationId: branchId }),
      supplierId: supplierId || null,
      boughtOn,
      billNo: billNo.trim() || null,
      gstMinor,
      lines: parsed.map((p) => (p as { line: PurchaseLineInput }).line),
      ...(anyway ? { anyway: true } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      const saved = (await api.savePurchase(purchaseId, body)).purchase;
      let text = purchaseId ? t('corrected') : t('saved');
      if (photo) {
        try {
          await api.uploadPurchasePhoto(saved.id, photo);
        } catch {
          // Error Handling — the stock in is saved; only the picture is missing, and the owner is told to add it again.
          text = `${text} ${t('photoFailed')}`;
        }
      }
      onDone(text);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_bill') {
        setDupAt((err.body as { enteredAt?: string } | undefined)?.enteredAt ?? '');
      } else {
        setError(err instanceof ApiError ? { text: err.message, field: err.field } : { text: tk('saveFailed') });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!purchaseId) return;
    setBusy(true);
    try {
      await api.deletePurchase(purchaseId);
      onDone(t('deleted'));
    } catch (err) {
      setConfirmDelete(false);
      setError(err instanceof ApiError ? { text: err.message } : { text: tk('saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const title = purchaseId ? t('titleEdit') : t('titleNew');
  const ready = suppliers !== null && loaded;

  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
        <div ref={sheetRef} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <button type="button" className="sheet-head-cancel" disabled={busy} onClick={onClose}>
              {tk('cancel')}
            </button>
            <span className="sheet-head-title">{title}</span>
            <span className="prd-head-spacer" aria-hidden="true" />
          </div>
          <div className="sheet-body prd-form-body">
            {failed ? (
              <div role="alert" className="ks-state ks-state-error">
                <p>{tk('loadFailed')}</p>
              </div>
            ) : !ready ? (
              <ul className="ks-list" aria-busy="true" aria-label={tk('loading')}>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="ks-row ks-skel" aria-hidden="true" />
                ))}
              </ul>
            ) : (
              <>
                <div className="prd-field">
                  <label className="prd-field-label" htmlFor="ks-in-supplier">
                    {t('supplier')}
                  </label>
                  <select id="ks-in-supplier" className="prd-input ks-field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                    <option value="">{t('noSupplier')}</option>
                    {suppliers!.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {suppliers!.length === 0 ? <span className="ks-hint">{t('supplierHint')}</span> : null}
                </div>
                <div className="ks-two">
                  <div className="prd-field">
                    <label className="prd-field-label" htmlFor="ks-in-date">
                      {t('date')}
                    </label>
                    <input
                      id="ks-in-date"
                      type="date"
                      className="prd-input ks-field"
                      value={boughtOn}
                      max={today}
                      aria-invalid={error?.field === 'boughtOn' || undefined}
                      onChange={(e) => setBoughtOn(e.target.value)}
                    />
                  </div>
                  <div className="prd-field">
                    <label className="prd-field-label" htmlFor="ks-in-bill">
                      {t('billNo')}
                    </label>
                    <input
                      id="ks-in-bill"
                      className="prd-input ks-field"
                      value={billNo}
                      maxLength={40}
                      placeholder={t('optional')}
                      onChange={(e) => {
                        setBillNo(e.target.value);
                        setDupAt(null);
                      }}
                    />
                  </div>
                </div>

                <ul className="ks-in-lines" aria-label={t('lines')}>
                  {lines.map((d, i) => {
                    const m = byId.get(d.materialId);
                    const unit = m ? unitWord(m.unit) : '';
                    const p = parsed[i]!;
                    const label = (k: string) => `${m?.name ?? ''} · ${k}`;
                    return (
                      <li key={d.key} className="ks-in-line">
                        <div className="ks-in-line-head">
                          <strong className="ks-name">{m?.name ?? t('gone')}</strong>
                          <button
                            type="button"
                            className="rc-remove"
                            aria-label={t('remove', { name: m?.name ?? '' })}
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== d.key))}
                          >
                            <IconTrash />
                          </button>
                        </div>
                        <div className="prd-seg ks-in-seg" role="group" aria-label={label(t('how'))}>
                          <button type="button" className={d.packed ? '' : 'is-on'} aria-pressed={!d.packed} onClick={() => change(d.key, { packed: false })}>
                            {t('loose')}
                          </button>
                          <button type="button" className={d.packed ? 'is-on' : ''} aria-pressed={d.packed} onClick={() => change(d.key, { packed: true })}>
                            {t('inPacks')}
                          </button>
                        </div>
                        {d.packed ? (
                          <div className="ks-two">
                            <label className="ks-in-field">
                              <span>{t('packName')}</span>
                              <input
                                className="prd-input ks-field"
                                value={d.packLabel}
                                maxLength={30}
                                placeholder={t('packNamePh')}
                                onChange={(e) => change(d.key, { packLabel: e.target.value })}
                              />
                            </label>
                            <label className="ks-in-field">
                              <span>{t('packSize', { unit })}</span>
                              <input
                                className="prd-input ks-field"
                                inputMode="decimal"
                                value={d.packSize}
                                placeholder="30"
                                onChange={(e) => change(d.key, { packSize: e.target.value })}
                              />
                            </label>
                          </div>
                        ) : null}
                        <div className="ks-two">
                          <label className="ks-in-field">
                            <span>{d.packed ? t('packCount') : t('qty', { unit })}</span>
                            <input
                              className="prd-input ks-field"
                              inputMode="decimal"
                              value={d.packs}
                              placeholder={d.packed ? '2' : '8'}
                              onChange={(e) => change(d.key, { packs: e.target.value })}
                            />
                          </label>
                          <label className="ks-in-field">
                            <span>{d.packed ? t('pricePack') : t('priceUnit', { unit })}</span>
                            <input
                              className="prd-input ks-field"
                              inputMode="decimal"
                              value={d.price}
                              placeholder={t('noPrice')}
                              onChange={(e) => change(d.key, { price: e.target.value })}
                            />
                          </label>
                        </div>
                        {'line' in p ? (
                          <p className="ks-meta ks-in-sum">
                            {t('lineSum', { qty: amount(p.qty), unit })} · {p.totalMinor === null ? t('noPrice') : formatMoney(p.totalMinor, 'INR', locale)}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <div className="prd-field ks-find">
                  <label className="prd-field-label" htmlFor="ks-in-find">
                    {t('findItem')}
                  </label>
                  <input
                    id="ks-in-find"
                    className="prd-input ks-search"
                    type="search"
                    value={find}
                    placeholder={t('findItemPh')}
                    aria-invalid={error?.field === 'lines' || undefined}
                    onChange={(e) => setFind(e.target.value)}
                  />
                  {find.trim() ? (
                    shownFind.length === 0 ? (
                      <span className="ks-hint">{t('noItem')}</span>
                    ) : (
                      <ul className="ks-list ks-find-list">
                        {shownFind.map((m) => (
                          <li key={m.id}>
                            <button type="button" className="ks-row ks-row-btn" onClick={() => add(m)}>
                              <span className="ks-name">{m.name}</span>
                              <span className="ks-meta">+ {t('add')}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </div>

                <div className="prd-field">
                  <label className="prd-field-label" htmlFor="ks-in-gst">
                    {t('gst')}
                  </label>
                  <input
                    id="ks-in-gst"
                    className="prd-input ks-field"
                    inputMode="decimal"
                    value={gst}
                    placeholder={t('optional')}
                    aria-invalid={error?.field === 'gst' || undefined}
                    onChange={(e) => setGst(e.target.value)}
                  />
                  <span className="ks-hint">{t('gstHint')}</span>
                </div>

                <div className="prd-field">
                  <span className="prd-field-label">{t('photo')}</span>
                  <label className="btn btn-ghost ks-photo">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                    <span>{photo ? photo.name : photoUrl ? t('photoChange') : t('photoAdd')}</span>
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                  </label>
                  {photoUrl && !photo ? (
                    <a className="ks-photo-link" href={photoUrl} target="_blank" rel="noreferrer">
                      {t('photoView')}
                    </a>
                  ) : null}
                </div>

                <p className="ks-in-total" aria-live="polite">
                  <span>{t('total')}</span>
                  <strong>{formatMoney(total, 'INR', locale)}</strong>
                  {gstMinor ? <span className="ks-meta">{t('gstLine', { gst: formatMoney(gstMinor, 'INR', locale) })}</span> : null}
                </p>

                {dupAt !== null ? (
                  <div className="rc-warn ks-dup" role="alert">
                    <span>{dupAt ? t('duplicate', { date: formatDate(dupAt, timezone, locale) }) : t('duplicateNoDate')}</span>
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save(true)}>
                      {t('saveAnyway')}
                    </button>
                  </div>
                ) : null}
                {error ? (
                  <div role="alert" className="sheet-foot sheet-foot-error">
                    {error.text}
                  </div>
                ) : null}
                {purchaseId ? (
                  <div className="prd-action-row prd-action-row-danger">
                    <div className="prd-action-copy">
                      <strong>{t('delete')}</strong>
                      <span>{t('deleteHint')}</span>
                    </div>
                    <button type="button" className="btn btn-ghost btn-danger prd-delete-btn" disabled={busy} onClick={() => setConfirmDelete(true)}>
                      {t('deleteButton')}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="prd-sheet-footer">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
              {tk('cancel')}
            </button>
            <button type="button" className="btn prd-footer-save" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? tk('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
      {confirmDelete ? (
        <ConfirmDialog
          tone="danger"
          title={t('deleteTitle')}
          body={t('deleteBody')}
          confirmLabel={t('deleteButton')}
          cancelLabel={t('deleteKeep')}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </>
  );
}
