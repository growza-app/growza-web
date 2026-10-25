'use client';

import { useEffect, useState } from 'react';
import { PayFlow } from '../../appointments/new/PayFlow';

/**
 * Dedicated counter sale / retail POS screen for products (`/products/sell`).
 *
 * Shares `PayFlow`'s payment & receipt engine without services, staff or waiting tokens:
 * Client + Product Categories on the left, Product shelf (with barcode scanner & stock filter)
 * in the middle, and The Bill + payment methods on the right.
 */
export function SellProductClient({
  timezone,
  backTo,
  heading,
  nextTokenNo,
  onSaleCompleted,
}: {
  timezone: string;
  backTo?: '/products' | '/sales' | '/orders';
  /** Jira GRW-616 — the till's name under another address (a shop's "Take an order"). Absent is "Sell product". */
  heading?: string;
  /** Next sequential daily token number for today at this branch, so the receipt and done screen show it. */
  nextTokenNo?: number | null;
  /** Called when a sale is recorded on POS so the live token queue updates immediately. */
  onSaleCompleted?: (saleId: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1101px)');
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    setWide(mql.matches);
    setReady(true);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  if (!ready) return <div className="pf" aria-busy="true" />;

  return (
    <PayFlow
      tokenGone={false}
      providerId={null}
      timezone={timezone}
      backTo={backTo}
      wide={wide}
      productsOnly
      heading={heading}
      nextTokenNo={nextTokenNo}
      onSaleCompleted={onSaleCompleted}
    />
  );
}
