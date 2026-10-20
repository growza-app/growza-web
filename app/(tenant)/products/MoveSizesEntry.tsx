'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Product } from '../lib/api-types';
import { useSession, useSizesOn } from '../components/SessionProvider';
import { MoveSizesSheet } from './MoveSizesSheet';

/**
 * Jira GRW-601 — the way into moving sizes, on the Stock part of a product that has them.
 *
 * Only while sizes are switched on, only for the people who can move stock (the owner), and only when there is
 * another branch to send to. After a send the sheet closes and one line says what went where.
 */
export function MoveSizesEntry({ product, onChanged }: { product: Product; onChanged: (p: Product) => void }) {
  const t = useTranslations('products.moveSizes');
  const session = useSession();
  const sizesOn = useSizesOn();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ n: number; branch: string } | null>(null);

  const others = (session?.branches ?? []).filter((b) => b.id !== product.locationId);
  const canMove = session?.role === null || session?.role === undefined || session?.role === 'owner' || session?.role === 'manager';
  if (!sizesOn || !canMove || others.length === 0) return null;

  return (
    <>
      <button type="button" className="btn prd-sizes-open" onClick={() => setOpen(true)}>
        {t('open')}
      </button>
      {done ? (
        <p className="sheet-foot prd-sizes-note" role="status">
          {t('done', { n: done.n, branch: done.branch })}
        </p>
      ) : null}
      {open ? (
        <MoveSizesSheet
          product={product}
          onClose={() => setOpen(false)}
          onMoved={(p, n, branch) => {
            setOpen(false);
            setDone({ n, branch });
            onChanged(p);
          }}
        />
      ) : null}
    </>
  );
}
