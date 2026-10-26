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
  reloadKey,
}: {
  timezone: string;
  backTo?: '/products' | '/sales' | '/orders';
  /** Jira GRW-616 — the till's name under another address (a shop's "Take an order"). Absent is "Sell product". */
  heading?: string;
  /** Next sequential daily token number for today at this branch, so the receipt and done screen show it. */
  nextTokenNo?: number | null;
  /** Called when a sale is recorded on POS so the live token queue updates immediately. */
  onSaleCompleted?: (saleId: string) => void;
  /** Incremented after a return or exchange on POS so the product shelf refreshes its live stock counts without unmounting the till. */
  reloadKey?: number;
}) {
  const [ready, setReady] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    /*
     * Followed, not read once (prod QA, 2026-10-24): the till decided its layout at load, so a tablet turned on its side,
     * iPad split view or a laptop window narrowed kept drawing the wide till below 1101px — where none of its styles apply:
     * "Categories" twice, bare buttons, and a search icon the width of the screen.
     */
    const mq = window.matchMedia('(min-width: 1101px)');
    const update = () => setWide(mq.matches);
    update();
    setReady(true);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
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
      reloadKey={reloadKey}
    />
  );
}
