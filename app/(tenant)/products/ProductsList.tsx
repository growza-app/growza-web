'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, formatMoney } from '../lib/api';
import type { Product } from '../lib/api-types';
import { PageHeader } from '../components/PageHeader';
import { WriteOnly } from '../components/WriteOnly';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useWritable } from '../components/SessionProvider';
import { IconPlus } from '../components/icons';
import { productPhotoUrl } from '../lib/service-photos';
import { ProductForm } from './ProductForm';

/**
 * Owner, 2026-10-14 — the shelf, one row per product: the picture, the name, the price, how many are left and
 * how many have sold. Tapping a row opens the sheet that edits it; retire, put back and delete are in the sheet.
 * No pages and no search: a salon's shelf is a short list, and the page scrolls.
 */
export function ProductsList({ products, branchId }: { products: Product[]; branchId: string }) {
  const t = useTranslations('products');
  const tc = useTranslations('common');
  const router = useRouter();
  const writable = useWritable();
  const [rows, setRows] = useState(products);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = (p: Product) => {
    setRows((prev) => {
      const at = prev.findIndex((x) => x.id === p.id);
      const next = at >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
      return [...next].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    });
    setEditing(null);
    router.refresh();
  };
  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProduct(deleting.id);
      setRows((prev) => prev.filter((x) => x.id !== deleting.id));
      setDeleting(null);
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : tc('actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <WriteOnly>
            <button type="button" className="btn" onClick={() => setEditing('new')}>
              <IconPlus /> {t('add')}
            </button>
          </WriteOnly>
        }
      />
      <div className="page-body prd-page">
        {rows.length === 0 ? (
          <div className="empty prd-empty">
            <p>{t('empty')}</p>
            <p className="prd-empty-hint">{t('emptyHint')}</p>
          </div>
        ) : (
          <ul className="prd-list">
            {rows.map((p) => (
              <li key={p.id} className={`prd-row ${p.active ? '' : 'prd-row-retired'}`}>
                <button type="button" className="prd-row-tap" onClick={() => (writable ? setEditing(p) : undefined)} disabled={!writable}>
                  <img className="prd-photo" src={productPhotoUrl(p)} alt="" loading="lazy" />
                  <span className="prd-name">
                    {p.name}
                    {!p.active ? <span className="chip prd-chip">{t('retired')}</span> : null}
                  </span>
                  <span className="prd-price">{formatMoney(p.priceMinor)}</span>
                  <span className={`prd-stock ${p.stock <= 0 ? 'prd-stock-out' : ''}`}>{p.stock <= 0 ? t('outOfStock') : t('stock', { n: p.stock })}</span>
                  <span className="prd-sold">{t('sold', { n: p.sold })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing ? (
        <ProductForm
          product={editing === 'new' ? null : editing}
          branchId={branchId}
          onSaved={saved}
          onDelete={(p) => setDeleting(p)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={t('delete')}
          body={t('deleteAsk', { name: deleting.name })}
          confirmLabel={t('delete')}
          tone="danger"
          busy={busy}
          error={error}
          onConfirm={() => void remove()}
          onCancel={() => {
            setDeleting(null);
            setError(null);
          }}
        />
      ) : null}
    </>
  );
}
