import type { ProductGraphicKind } from '../components/ProductPhoto';
import type { OrderListRow } from '../lib/api-types';

/**
 * Owner, 2026-11-21 ("redesign the orders page like this too") — each order's tile on the Orders list, as the Menu
 * gives each dish one: a drawing of how the order went out, on a colour that says the same at a glance. Kinds, not
 * channels' brands: an app order is a bike in orange whichever app it came from (its name is in the From column).
 *
 * The colours are the section hues (`--cat-1…6`), identity only, never a status: a cancelled order's tile goes grey
 * through its row, not through this.
 */
export interface OrderTile {
  kind: ProductGraphicKind;
  /** 1–6, the `--cat-N` hue. */
  hue: number;
}

const APPS = new Set(['swiggy', 'zomato']);
const MARKETPLACES = new Set(['flipkart', 'amazon']);

export function orderTile(r: Pick<OrderListRow, 'channel' | 'orderType'>, kitchen: boolean): OrderTile {
  if (APPS.has(r.channel) || r.orderType === 'delivery') return { kind: 'scooter', hue: 2 };
  if (MARKETPLACES.has(r.channel)) return { kind: 'box', hue: 5 };
  if (kitchen && r.orderType === 'dine_in') return { kind: 'cutlery', hue: 1 };
  if (kitchen && r.orderType === 'takeaway') return { kind: 'bag', hue: 4 };
  return { kind: 'bag', hue: 6 };
}
