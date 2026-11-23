'use client';

import { createContext, useContext } from 'react';
import type { PosMode } from './pos-helpers';

export type TillOrderType = 'dine_in' | 'takeaway' | 'delivery';

/**
 * Owner, 2026-11-22 ("go D") — at a branch that seats its guests, the POS has ONE row on top: Dine-in · Takeaway · Delivery,
 * the Kitchen and a ⋯ for Return. Sell / Pickup / Return is gone from it: Pickup lives under Takeaway (where its orders
 * are), and Return is a rare job in ⋯.
 *
 * The switch itself stays the till's (PayFlow owns the type and its lock, GRW-745 BR-01); the POS gives it a place in its
 * bar (`slot`) and says what the bar is showing (`mode`). The till says back which type it is on (`onTypeShown`), so the
 * POS can open the New order / Pickup switch under Takeaway.
 */
export interface PosTypeBar {
  /** Where the till draws its Dine-in · Takeaway · Delivery switch. Null until the bar has mounted. */
  slot: HTMLElement | null;
  mode: PosMode;
  /** Orders waiting in Pickup, or null where this till keeps no Pickup. */
  pickupCount: number | null;
  /** Back to the till from Pickup or Return. */
  toSell: () => void;
  /** The till's type, as it changes (null: the till is not showing the switch). */
  onTypeShown: (type: TillOrderType | null) => void;
  /** Owner, 2026-11-23 — the till is showing its paid screen: the bar and New order / Pickup step aside for it. */
  onPaidShown: (paid: boolean) => void;
}

export const PosTypeBarContext = createContext<PosTypeBar | null>(null);

export function usePosTypeBar(): PosTypeBar | null {
  return useContext(PosTypeBarContext);
}

/** Which tab the bar marks: Pickup is Takeaway's, Return is none of them. */
export function barTabShown(mode: PosMode, tillType: TillOrderType): TillOrderType | null {
  if (mode === 'queue') return 'takeaway';
  if (mode === 'return') return null;
  return tillType;
}
