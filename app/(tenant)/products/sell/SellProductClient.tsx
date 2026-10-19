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
}: {
  timezone: string;
  backTo?: '/products' | '/sales';
}) {
  const [ready, setReady] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    setWide(window.matchMedia('(min-width: 1101px)').matches);
    setReady(true);
  }, []);

  if (!ready) return <div className="pf" aria-busy="true" />;

  return <PayFlow tokenGone={false} providerId={null} timezone={timezone} backTo={backTo} wide={wide} productsOnly />;
}
