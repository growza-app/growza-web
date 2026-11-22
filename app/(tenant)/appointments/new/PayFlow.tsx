'use client';

import Link from '../../../shared/AppLink';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, formatMoney } from '../../lib/api';
import { fixVisitHref, nextCustomerHref } from '../../lib/pay-token';
import type { AddonGroup, Appointment, Offer, PaymentMode, Product, ProductCategory, Provider, Service, TillSize } from '../../lib/api-types';
import type { QueueEntry } from '../../lib/home-types';
import { receiptRows, type ReceiptRow } from '../../lib/receipt-text';
import { displayPhone } from '../../lib/phone';
import { formatDate } from '../../lib/format';
import { RedeemRow } from '../../components/RedeemRow';
import { useRewardQuote } from '../../lib/use-reward-quote';
import { ServicePhoto } from '../../components/ServicePhoto';
import { ProductPhoto } from '../../components/ProductPhoto';
import { ALL_CATEGORIES, DeskProductCategories, NO_CATEGORY } from '../../products/DeskProductCategories';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useBranch } from '../../components/BranchProvider';
import { HeaderBranchPicker } from '../../components/HeaderBranchPicker';
import { PAYMENT_MODES } from '../../lib/payment-modes';
import { useLabel } from '../../components/LabelsProvider';
import { nounInSentence, pickNoun } from '../../lib/nouns';
import { useNouns } from '../../lib/use-nouns';
import { LargeAmountDeclined, useLargeAmountGuard } from '../../components/LargeAmountConfirm';
import { useAreas, useSession } from '../../components/SessionProvider';
import { IconArrowLeft, IconCheck, IconClose, IconDelivery, IconDineIn, IconEdit, IconLock, IconMinus, IconPayCard, IconPayCash, IconPayOther, IconPayUpi, IconPlus, IconSearch, IconTakeaway, IconUserPlus } from '../../components/icons';
import { orderTypeFromUrl, writeOrderTypeToUrl } from '../../lib/order-type-url';
import { barTabShown, usePosTypeBar } from '../../pos/pos-type-bar';
import { FormModeSwitch } from './FormModeSwitch';
import { ClientSheet } from './ClientSheet';
import { Keypad } from './Keypad';
import { ServiceSheet } from '../../components/ServiceSheet';
import { BillCard, BillRows, lineKey, lineMinor, type BillLine as Line } from './BillCard';
import { PosBillRows } from './PosBillRows';
import { DeskServiceGrid } from './DeskServiceGrid';
import { DeskUnpaid } from './DeskUnpaid';
import { useBarcodeScan } from '../../lib/barcode-scan';
import { planScans, type ScanProblem } from '../../lib/scan-plan';
import { canAddSize, groupProductLines, hasSizes, productLineKey, sizedName, sizePriceMinor } from '../../lib/till-sizes';
import { hasAreaPrices, withAreaPrices, type AreaPricing } from '../../lib/area-prices';
import { useBillOffers } from '../../lib/use-bill-offers';
import { CouponRow, OfferLines } from './CouponRow';
import { SizeSheet } from './SizeSheet';
import { ChoiceSheet, type DishChoice } from './ChoiceSheet';
import { useAddonsOn } from '../../components/SessionProvider';
import { AppOrderNoSheet } from './AppOrderNoSheet';
import { queueScan, takeScans } from '../../lib/scan-queue';
import { heldBillsKey, heldStamp, loadHeldBills, saveHeldBills } from '../../lib/held-bills';
import { BUZZ, buzz, remember, remembered, SOUND_KEY } from '../../lib/pay-feedback';
import { PaymentDone } from '../../components/PaymentDone';
import { PrintStatusLine, TillPrintActions, useTicketPrinter } from '../../components/TicketPrinter';
import { TableMap } from '../../pos/TableMap';
import { TableBillSheet } from '../../pos/TableBillSheet';
import { useWaiter } from '../../pos/waiter';
import type { DiningTable } from '../../lib/api';
import type { KitchenSlips, KitchenTicketDto } from '../../lib/api-types';
import { slipsOf } from '../../lib/print/from-api';
import type { BillData } from '../../lib/print/ticket';
import { keepOfflineOrder, neverArrived, nextOfflineCount, offlineTokenOf, tillLetter, deviceKey, useOfflineTill, type OfflineOrderBody } from '../../lib/offline-till';
import { OfflineTillBar } from '../../components/OfflineTillBar';
import { DiscountSheet } from './DiscountSheet';
import { freeBillBlock, isFreeBill, shownPercent } from './bill-discount';
import { FreeBillReason } from './FreeBillReason';

/**
 * Record payment in three taps (owner, 2026-10-09).
 *
 * The one-page form asks five things at once — who, which stylist, which of fifty services, how they paid, Mark
 * done — through two search boxes, and the amount is not on the screen until a service is picked. An owner who does
 * not read well gets stuck at the first box. This is the same sale asked the way Square, PhonePe and Khatabook ask
 * it: one question per screen, pictures and numbers where there were words, and nothing to type.
 *
 *   ① What did they get?   — photo tiles of the services most sold here; tap one, it is on the bill
 *   ② How did they pay?    — three tiles the height of a thumb; tapping one IS the save
 *   ③ Done                 — the amount, large, and said aloud; the bill to send on WhatsApp
 *
 * Phones only. The desk at a desktop keeps the full form, and `?full=1` opens it on a phone for the sale this
 * cannot write (a package, a price per line, a client to add by name). The save is `POST /counter-sales`, the one
 * call the full form makes for a sale with no chair (GRW-293) or for a token (GRW-403), so nothing here invents a
 * second way of recording money.
 */

/** The sale, once the API has it. Kept whole so the done screen never re-reads state that moved on. */
interface Sale {
  appointmentId: string;
  tokenNo: number | null;
  totalMinor: number;
  mode: PaymentMode;
  /** How it was paid, in the owner's words: "Cash", or "Cash ₹800 · UPI ₹499" for a bill paid two ways. */
  paidBy: string;
  /** Owner, 2026-10-24 — an app's order took no money here: "₹300 order from Swiggy", not "₹300 received". */
  title?: string;
  bill: ReceiptRow[];
  phone: string | null;
  summary: string;
  /** The visit's own day in the salon's zone — what "Fix a mistake" needs to find it in the list. */
  day: string;
  /** Only products were sold: the id is a sale's, not a booking's, so there is nothing in Bookings to open. */
  productOnly: boolean;
  /** Jira GRW-713 — the KOT this order sent to the kitchen, for Print KOT on the done screen. Absent with no kitchen. Jira GRW-733 — one per station. */
  kot?: KitchenSlips;
  /** Where the order came from: 'counter' or a delivery app. The KOT names it. */
  channel: string;
  /** Jira GRW-716 — taken with no internet: its till's token ("A12") and the receipt the till printed itself. */
  offlineToken?: string;
  receipt?: BillData;
}

/**
 * Who the sale is for (owner, 2026-10-10 — a name is required before the sale can be recorded).
 *
 * `none` is the starting state and the one the Next button refuses. It used to be `walkIn`, a shared anonymous
 * row every unnamed sale was written against; the owner's decision, stated twice, is that a salon should know
 * who it served. Taken with open eyes: a name with no number cannot be matched to anything, so two Rameshes are
 * two rows and a returning Ramesh is a third. The number — when the client gives one — is what makes them one
 * person, which is why the sheet still asks for it and why ③ still offers to keep it.
 */
type Client =
  | { kind: 'none' }
  | { kind: 'named'; name: string; /** Jira GRW-716 — a new guest's number, kept on the order when the guest was added offline. */ phone?: string | null }
  | { kind: 'existing'; id: string; name: string | null; phone: string | null };

/** The tiles on ①: enough to cover a salon's everyday menu, few enough that each is the size of a thumb. */
const TILES = 8;

/** A price in the keypad: whole rupees as they were, paise kept (₹99.50 is "99.5", never rounded up to 100 by pressing ✓). */
const rupeesText = (minor: number): string => String(minor / 100);
/** The counter-sale route takes 1–30 lines (`MAX_VISIT_LINES` in the API; was 12 until Jira GRW-572). */
const MAX_LINES = 30;
/** The phone remembers two things for the next sale: who did it, and whether the done screen speaks. */
const STYLIST_KEY = 'growza.pay.stylist';

const PAY_ICONS: Record<PaymentMode, ReactNode> = {
  cash: <IconPayCash />,
  card: <IconPayCard />,
  upi: <IconPayUpi />,
  other: <IconPayOther />,
};

/** The same shape `NewVisitSheet` sends: a key per attempt, so a retry after a lost response is not a second sale. */
function newAttemptKey(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


/**
 * A changed total, spread over the lines in proportion to their list prices, the last line taking the rounding.
 * The API wants an amount per leg; the owner wants to type one number.
 */

/** Jira GRW-745 — the icon beside each way of eating, so the type is never said by colour alone. */
function TypeIcon({ type }: { type: 'dine_in' | 'takeaway' | 'delivery' }) {
  return <span className="pf-type-icon" aria-hidden="true">{type === 'dine_in' ? <IconDineIn /> : type === 'delivery' ? <IconDelivery /> : <IconTakeaway />}</span>;
}

export function spread(lines: readonly { priceMinor: number }[], totalMinor: number): number[] {
  const list = lines.reduce((sum, l) => sum + l.priceMinor, 0);
  let left = totalMinor;
  return lines.map((l, i) => {
    if (i === lines.length - 1) return left;
    const share = list === 0 ? 0 : Math.round((totalMinor * l.priceMinor) / list);
    left -= share;
    return share;
  });
}


export function PayFlow({
  token,
  tokenGone,
  visit,
  visitGone = false,
  providerId,
  timezone,
  backTo,
  wide = false,
  initialTab,
  productsOnly = false,
  heading,
  nextTokenNo,
  hideHead,
  leaveRef,
  onSaleCompleted,
  onOpenQueue,
  onPayTable,
  reloadKey = 0,
  addingTo = null,
  inactive = false,
}: {
  /** A waiting token being paid: its client, branch and services are the answer to ①. */
  token?: QueueEntry;
  tokenGone: boolean;
  /**
   * Owner, 2026-10-10 — a BOOKING being settled, in place of the till that used to open over it.
   *
   * Everything on ① is filled in from it: who it is, who did it, what they had and what it was booked at. All
   * of it stays editable, because what was booked and what happened are different things often enough.
   *
   * The write is the difference and it is not cosmetic. A walk-in's payment CREATES the visit; a booking's
   * payment COMPLETES rows that already exist. Recording a sale here would leave the booking `confirmed` for
   * ever beside a second visit for the same work — the money right and the calendar wrong.
   */
  visit?: { appointment: Appointment; legs: Appointment[] };
  /** The booking named is no longer settleable — settled elsewhere, moved, cancelled. */
  visitGone?: boolean;
  /** The signed-in person's own chair, when they have one: the stylist ① starts on. */
  providerId: string | null;
  timezone: string;
  backTo?: '/appointments' | '/products' | '/sales' | '/orders';
  /**
   * Jira GRW-572 — a laptop ≥1101px: the same till laid out in three panels (who · what · the bill), with the
   * payment tiles beside the bill so ② is not a screen of its own. Same state, same `pay()`, same two writes.
   */
  wide?: boolean;
  /** Open directly on the Products tab (desk) or Products sheet chip (phone), e.g. from Home's Sell product button. */
  initialTab?: 'products';
  /** Retail / Sell product page (`/products/sell`): client + product categories on the left, product shelf in the middle, bill + payment on the right. */
  productsOnly?: boolean;
  /**
   * Jira GRW-616 — the till's own name when it is opened under another address: a shop's `/orders/new` says what a shop
   * says. Absent is "Sell product" (`payFlow.sellTitle`), so every address that has always opened this till reads as it did.
   */
  heading?: string;
  /** Daily sequential token number for today's POS queue. */
  nextTokenNo?: number | null;
  /**
   * Owner, 2026-11-03 — the POS draws this flow's header itself, in the bar at the very top of the screen.
   * The title row said "Take an order" under a tab already reading Sell, and cost a row the phone did not have.
   */
  hideHead?: boolean;
  /** Where the POS's own Back button reaches `leave`, so moving the control changes nothing it does. */
  leaveRef?: { current: (() => void) | null };
  /** Notifies the POS shell when a sale completes so the live token queue updates immediately. */
  onSaleCompleted?: (saleId: string) => void;
  /** Opens the POS Queue tab directly when the desk taps "View Queue" on the queued-order confirmation banner. */
  onOpenQueue?: () => void;
  /**
   * Owner, 17 Nov 2026 — "these options should be as we have without tables": a table's Take payment opens the same
   * payment screen a Pickup order is paid on (ways to pay, split, discount, points, QR, the guest), not three buttons.
   */
  onPayTable?: (bill: { saleId: string; tableName: string }) => void;
  /** Incremented after a return or exchange on POS so the product shelf refreshes its live stock counts in place. */
  reloadKey?: number;
  /**
   * Owner, 9 Nov 2026 — the Queue's "Add items": what is picked here goes onto an order already waiting for payment
   * (same token, paid for once) instead of becoming a new sale. No guest and no payment step: the order has both.
   */
  addingTo?: {
    tokenLabel: string;
    onAdd: (products: Array<{ productId: string; variantId?: string; qty: number; paidMinor: number }>) => Promise<void>;
    onStop: () => void;
  } | null;
  /**
   * Owner, 9 Nov 2026 — kept on the page but not in front of anyone (the POS keeps the Sell till mounted, with its
   * half-built bill, while "Add items" uses a second one). Hidden, it must not answer the keyboard or a scanner:
   * F8 would ring up a bill nobody can see, and a scanned code would land in it.
   */
  inactive?: boolean;
}) {
  const t = useTranslations('payFlow');
  const ts = useTranslations('payFlow.size');
  const tcr = useTranslations('chrome');
  const nv = useNewVisitCopy();
  const locale = useLocale();
  const tNouns = useTranslations('nouns');
  const router = useRouter();
  const session = useSession();
  // Is there a count behind what the till sells? False for a kitchen, which cooks a dish when it is ordered: nothing
  // here is ever refused or hidden for stock, and no tile says how many are left.
  const areas = useAreas();
  const counted = areas.stock;
  /*
   * Owner, 2026-10-24 — where this order came from: the counter, or one of the business's delivery apps (Swiggy and
   * Zomato for a restaurant; none for anyone else, so nothing below shows). An app's order is paid to the app, so the
   * till asks no way of paying and needs no guest; the app's order number is kept with it when the desk types it.
   */
  const apps = productsOnly ? (areas.deliveryApps ?? []) : [];
  const [orderFrom, setOrderFrom] = useState<string>('counter');
  const [appOrderNo, setAppOrderNo] = useState('');
  const [orderNoOpen, setOrderNoOpen] = useState(false);
  const fromApp = apps.includes(orderFrom) ? orderFrom : null;
  /** "Swiggy", "Zomato" — the app's own name, which is the same in every language. */
  const appWord = (app: string) => (app === 'swiggy' || app === 'zomato' ? t(`from.apps.${app}`) : app);
  const branch = useBranch();
  /*
   * Jira GRW-720 — a branch that seats its guests asks first how the guest is eating: Dine-in, Takeaway, or Delivery
   * (only where the business has a delivery app). Dine-in is where a fresh till opens; the tab chosen then stays for the
   * next order on this device until the page is opened again (BR-04). A branch that does not seat guests sees none of
   * this — its till is exactly as it was (BR-01).
   */
  const [orderTab, setOrderTabState] = useState<'dine_in' | 'takeaway' | 'delivery'>(() => orderTypeFromUrl() ?? 'dine_in');
  /** Jira GRW-745 FR-02 — the type is in the address: a refresh or Back keeps it. Written in place, no navigation. */
  const setOrderTab = (next: 'dine_in' | 'takeaway' | 'delivery') => {
    setOrderTabState(next);
    writeOrderTypeToUrl(next);
  };
  /*
   * Jira GRW-721 — the table this order is for: picked on the map, then the dish grid as always, and "Send to kitchen"
   * puts the dishes on that table's bill (a new one, or the round onto the one running). The bill of a busy table
   * opens in a sheet over the map. `mapKey` makes the map read again the moment the till changed something.
   */
  /** The table being ordered for; `billId` when the till opened its bill to add a round (QA 2026-11-16: refused if it moved). */
  /** Jira GRW-732 — `seated` when the till opened a Seated table to take its first order (the server checks nobody seated it since). */
  // Jira GRW-734 — `pricing`: the table's area's own prices, shown on its dishes (the server prices the round the same way).
  const [atTable, setAtTable] = useState<{ id: string; label: string; billId?: string; seated?: boolean; pricing?: AreaPricing } | null>(null);
  const [guests, setGuests] = useState<number | null>(null);
  const [seating, setSeating] = useState(false);
  const [billOf, setBillOf] = useState<{ table: DiningTable; area: string; pricing?: AreaPricing } | null>(null);
  const [mapKey, setMapKey] = useState(0);
  /** What the till just did at a table, said in full: "Sent to kitchen · T3", "T3 paid · ₹640", "T1 moved to T3." */
  const [tableSent, setTableSent] = useState<string | null>(null);
  const tTables = useTranslations('posTables');
  // Jira GRW-723 — a waiter's till is the room only: Dine-in, no type tabs, and an "off" screen where the branch seats nobody.
  const waiter = useWaiter();
  const providerNoun = useLabel('provider', 'Staff member');
  // The person paying, in the vertical's own word — Guest at a restaurant, Customer at a shop.
  const clientNoun = pickNoun(locale, useLabel('customer', 'Client'), tNouns('customer'));
  const productsNoun = useLabel('products', 'Products');
  // Restaurant QA 2026-10-24 — one of what the till sells, in the business's word: "Tap a dish", "Sell dish".
  const nouns = useNouns();
  const { guard, dialog } = useLargeAmountGuard();

  // The branch this sale lands at: the token's, else the one the header has chosen, else the only one.
  /*
   * The branch this payment belongs to: the token's, the BOOKING's, then whatever the header is showing.
   *
   * Jira GRW-380 — a visit is settled at its own branch's menu, at its own branch's prices. The booking's
   * branch was missing from this chain when bookings started settling here (owner, 2026-10-10): a desk with
   * the header on MG Road, settling an Indiranagar booking, would have added extras from the wrong menu.
   */
  const location = token?.locationId ?? visit?.appointment.locationId ?? branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;
  // Jira GRW-720 — after `location`, which it reads (it sat above it once, and the till did not open: caught by the e2e run).
  const tablesHere = productsOnly && Boolean(session?.branches?.find((b) => b.id === location)?.tableOrders);
  // Owner, 17 Nov 2026 — with tables on, the till's Queue is called Pickup (PosClient's `qk`).
  const qk = <K extends string>(key: K): K | `${K}Pickup` => (tablesHere ? `${key}Pickup` : key);
  // Jira GRW-716 — this till's letter while online, and whatever it kept offline sent when the connection is back.
  const tillBranches = useMemo(() => (session?.branches ?? []).map((b) => b.id), [session?.branches]);
  useOfflineTill(productsOnly ? location : null, tillBranches);
  const branchName = (session?.branches?.length ?? 0) > 1 ? (session?.branches?.find((b) => b.id === location)?.name ?? null) : null;
  /*
   * The QR to hold up here, if the owner has uploaded one (owner, 2026-10-11).
   *
   * `/me` resolves it per branch — this branch's own, else the business-wide one — and sends it only to the
   * roles that stand at the till, so there is nothing to decide or to hide here: a URL means show the screen,
   * null means UPI records the payment as it always did. An API a deploy behind sends no field, which reads as
   * null and leaves the old behaviour in place.
   *
   * It is a signed URL minted in a one-hour window (`SIGNING_WINDOW_MS`), so the copy `/me` handed this page is
   * good for at least an hour and is byte-identical between renders, which is what lets the browser cache it.
   */
  const paymentQr = branch.branches.find((b) => b.id === location)?.paymentQrUrl ?? null;
  const googleReviewUrl =
    branch.branches.find((b) => b.id === location)?.googleReviewUrl ??
    session?.branches?.find((b) => b.id === location)?.googleReviewUrl ??
    null;

  /*
   * A QR that is recorded but will not draw (owner, 2026-10-13: "it's showing blank").
   *
   * `/me` says there is one, so the tile opens this screen — and then the picture is a 317px hole: the file
   * behind the URL is gone, or the phone is offline. An owner holding that up to a customer has nothing to say.
   * The image tells us by failing, and the screen then says what is wrong and where to fix it.
   */
  const [qrBroken, setQrBroken] = useState(false);
  const [step, setStep] = useState<'what' | 'how' | 'qr' | 'done'>('what');
  const [services, setServices] = useState<Service[] | null>(productsOnly ? [] : null);
  const [ranked, setRanked] = useState<string[] | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  /** Whether the branch's people have come back yet — an empty list means nothing until they have. */
  const [providersKnown, setProvidersKnown] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  /*
   * Jira GRW-745 — a phone has no room beside the order-type switch: a tap on a locked choice says why (a laptop says it
   * beside the switch, always). Cleared when the order is free to change type again (no table, no dish).
   */
  const [typeNudge, setTypeNudge] = useState(false);
  const typeLocked = atTable !== null || lines.length > 0;
  useEffect(() => {
    if (!typeLocked) setTypeNudge(false);
  }, [typeLocked]);
  /*
   * Owner, 2026-11-22 ("go D") — on the POS the switch is drawn in the POS's own bar (the one row on top), and the POS is
   * told which type the till is on, so it can open New order / Pickup under Takeaway. The Add items till never is.
   */
  const typeBar = usePosTypeBar();
  const reportType = typeBar?.onTypeShown;
  const typeInBar = Boolean(typeBar?.slot) && tablesHere && !token && !waiter && !addingTo;
  useEffect(() => {
    if (!reportType || addingTo || token) return;
    reportType(typeInBar ? orderTab : null);
  }, [reportType, typeInBar, orderTab, addingTo, token]);
  /*
   * Owner, 2026-11-21 — the Delivery tab always has an app chosen. Opened from the address (`?type=delivery`), kept for the
   * next order after a sale, or before the branch's apps had loaded, it had none: the bill said "Delivery · Delivery" and
   * no chip was on. The first app is the one the tab's own tap already picks.
   */
  const firstApp = apps[0];
  useEffect(() => {
    if (tablesHere && orderTab === 'delivery' && !apps.includes(orderFrom) && firstApp) setOrderFrom(firstApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `apps` is a fresh array each render; `firstApp` carries it.
  }, [tablesHere, orderTab, orderFrom, firstApp]);
  /** Jira GRW-572 — the branch's priced combos, for the wide till's Packages tab. Empty until read, and on a phone. */
  const [offers, setOffers] = useState<Offer[]>([]);
  /** Owner, 2026-10-14 — the branch's shelf (migration 0115): the Products tab on the desk, a chip in the phone's sheet. */
  const [menuProducts, setProducts] = useState<Product[]>([]);
  /** Jira GRW-734 — the menu at the price this order pays: a table's area's own prices, else the menu (takeaway, delivery). */
  const products = useMemo(() => withAreaPrices(menuProducts, atTable?.pricing), [menuProducts, atTable?.pricing]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productsFailed, setProductsFailed] = useState(false);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [productCategory, setProductCategory] = useState<string>(ALL_CATEGORIES);
  const [client, setClient] = useState<Client>({ kind: 'none' });
  /*
   * Jira GRW-648 — what this client has in reward points, and whether the desk is spending them.
   *
   * Null covers every case where there is nothing to offer: no client named yet, a business with points
   * switched off, a client with too few to spend on this bill, or a read that failed. All four draw nothing,
   * which is what the till looked like yesterday.
   */
  const [stylistId, setStylistId] = useState<string | null>(null);
  const [override, setOverride] = useState<number | null>(null);
  /** Owner, 2026-11-15 — the percentage the counter gave, when it gave one; named on the bill only while it still holds. */
  const [discountPct, setDiscountPct] = useState<number | null>(null);
  /*
   * Jira GRW-735 — a coupon typed at payment, and whether the counter's own discount beat it (BR-01: the larger is
   * kept). `couponLost` holds the coupon's name while the discount stands, so the row can say why nothing came off.
   */
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponLost, setCouponLost] = useState<string | null>(null);
  /** Jira GRW-736 — the points this bill spends, as last quoted: GST added on top is worked out after them. */
  const [pointsAsked, setPointsAsked] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  /** Jira GRW-725 — why the owner is giving the whole bill free; asked only while the bill is ₹0. */
  const [freeReason, setFreeReason] = useState('');
  const [keypad, setKeypad] = useState<string | null>(null);
  /** Owner, 2026-10-14 — the bill row the keypad is pricing; null means it is pricing the whole total. */
  const [keypadFor, setKeypadFor] = useState<{ key: string; name: string; list: number } | null>(null);
  const [whoOpen, setWhoOpen] = useState<false | 'find' | 'add'>(false);
  const [menuOpen, setMenuOpen] = useState(initialTab === 'products' && !wide && !productsOnly);
  const [billOpen, setBillOpen] = useState(false);
  const [saving, setSaving] = useState<PaymentMode | null>(null);
  /*
   * Owner, 2026-10-14 — a bill paid two ways (₹800 cash, the rest by UPI).
   *
   * `splitting` is the tiles asking "which way first?"; a tap then opens the keypad (`splitKeypad`) for how much
   * came that way; `firstWay` holds the answer, and the NEXT tile is the rest — tapping it is the save, as a
   * tile always is. One extra question, asked only by the owner who taps "Paid two ways"; the three-tap sale
   * is untouched. A first amount that covers the bill is simply a bill paid one way.
   */
  const [splitting, setSplitting] = useState(false);
  const [splitKeypad, setSplitKeypad] = useState<PaymentMode | null>(null);
  const [splitAmount, setSplitAmount] = useState('');
  const [firstWay, setFirstWay] = useState<{ mode: PaymentMode; minor: number } | null>(null);
  const [selectedMode, setSelectedMode] = useState<PaymentMode | null>(null);
  const [badMode, setBadMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What Next asked for and did not get. Null until Next is tapped; each half clears itself once answered. */
  const [missing, setMissing] = useState<{ client: boolean; service: boolean } | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [sound, setSound] = useState(true);
  const [attemptKey, setAttemptKey] = useState(newAttemptKey);
  const tokenFilled = useRef(false);
  const whoChips = useRef<HTMLDivElement>(null);

  // The chosen person stays in view: a row of faces scrolls sideways, and the one just picked from the sheet is first.
  useEffect(() => {
    whoChips.current?.querySelector('.pf-chip-on')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [client]);

  // Refresh shelf stock counts in place when a return or exchange is recorded in the POS sheet above this till.
  useEffect(() => {
    if (!reloadKey) return;
    // A table paid on the POS's payment screen: the room reads again, so its tile is free.
    setMapKey((k) => k + 1);
    let gone = false;
    void api
      .products(location)
      .then((rows) => {
        if (!gone) setProducts(rows);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [reloadKey, location]);

  // The menu, the people, the latest clients — three reads, all at once, none blocking the others.
  useEffect(() => {
    let gone = false;
    setProductsLoaded(false);
    setProductsFailed(false);
    setProductCategory(ALL_CATEGORIES);
    void api
      .products(location)
      .then((rows) => {
        if (!gone) {
          setProducts(rows);
          setProductsLoaded(true);
        }
      })
      .catch(() => {
        if (!gone) {
          setProducts([]);
          setProductsFailed(true);
          setProductsLoaded(true);
        }
      });
    if (productsOnly && location) {
      void api
        .productCategories(location)
        .then((rows) => {
          if (!gone) setProductCategories(rows);
        })
        .catch(() => {
          if (!gone) setProductCategories([]);
        });
    } else if (productsOnly) {
      setProductCategories([]);
    }
    if (productsOnly) {
      setServices([]);
      setProvidersKnown(true);
      return () => {
        gone = true;
      };
    }
    void api
      .services(location ?? undefined)
      .then((rows) => {
        if (!gone) setServices(rows);
      })
      .catch(() => {
        if (!gone) setServices([]);
      });
    if (wide && !visit) {
      void api
        .offers(location)
        .then((rows) => {
          if (!gone) setOffers(rows.filter((o) => o.active && o.comboPriceMinor && o.serviceIds.length > 0));
        })
        .catch(() => {
          if (!gone) setOffers([]);
        });
    }
    // Best effort: the tiles are the branch's most-sold services when the report answers, catalogue order when not.
    void api
      .reportsServices('last_3_months', false, undefined, undefined, undefined, location)
      .then((r) => {
        if (!gone) setRanked([...r.rows].sort((a, b) => b.bookings - a.bookings).map((row) => row.id));
      })
      .catch(() => {
        if (!gone) setRanked([]);
      });
    setProvidersKnown(false);
    void api
      .providers({ location })
      .then((rows) => {
        if (gone) return;
        setProviders(rows);
        setProvidersKnown(true);
      })
      // A failed read leaves no chips on screen, so there is no stylist to hold either: the reconcile below
      // needs to run for that case too, or the screen keeps one it is not showing.
      .catch(() => {
        if (!gone) setProvidersKnown(true);
      });
    return () => {
      gone = true;
    };
  }, [location, token, wide, visit, productsOnly]);

  /*
   * Who did it: the booking's own stylist, else the phone's last answer, else the signed-in person's chair.
   *
   * The booking is decided HERE rather than in the prefill effect below, which guards itself with a ref. In
   * development React mounts, unmounts and mounts again; the ref survives that, so the prefill's second pass
   * returns early while this effect runs a second time — and the remembered stylist quietly replaced the one
   * who is actually doing the work. One effect owns this state, so there is nothing to race.
   */
  useEffect(() => {
    const booked = visit?.appointment.providerId ?? null;
    const last = remembered(STYLIST_KEY);
    setStylistId(booked ?? (last === 'nobody' ? null : (last ?? providerId)));
    setSound(remembered(SOUND_KEY) !== 'off');
  }, [providerId, visit]);

  /*
   * The people this screen can offer, and the invariant underneath it: THE SCREEN NEVER HOLDS A STYLIST IT IS
   * NOT SHOWING (owner, 2026-10-11).
   *
   * `stylistId` is seeded from the phone's last answer, which is an id in `localStorage` and nothing more. The
   * chips are this BRANCH's people. When the remembered stylist is not one of them — they have been retired,
   * deleted, or they work at another branch — no chip lit up, so the desk read "no stylist chosen", and the
   * sale went out with that id anyway. The API refused it: "That staff member is not available", or "That
   * stylist works at another branch", on a screen that was not offering either of them.
   *
   * One exception, and it is the reason this is a list rather than a plain reset: the stylist who did a BOOKING
   * may have moved branch since, and they still did the work. The till this flow replaced kept them for exactly
   * that reason, so they are added to the chips instead of being dropped — shown, therefore holdable.
   */
  const shownProviders = useMemo(() => {
    const booked = visit?.appointment.providerId ?? null;
    if (!booked || providers.some((p) => p.id === booked)) return providers;
    return [
      ...providers,
      { id: booked, displayName: visit?.appointment.providerName ?? '', photoUrl: null } as Provider,
    ];
  }, [providers, visit]);

  useEffect(() => {
    if (!providersKnown || !stylistId) return;
    if (shownProviders.some((p) => p.id === stylistId)) return;
    // Forgotten as well as dropped: left in place it proposes the same impossible stylist on the next sale.
    setStylistId(null);
    remember(STYLIST_KEY, 'nobody');
  }, [providersKnown, stylistId, shownProviders]);

  // A token's services are the bill, once the menu is here to name them.
  useEffect(() => {
    if (!token || tokenFilled.current || !services) return;
    tokenFilled.current = true;
    const byId = new Map(services.map((s) => [s.id, s]));
    setLines(token.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => Boolean(s)).map(toLine));
  }, [token, services]);

  const toLine = (s: Service): Line => ({ serviceId: s.id, name: s.name, priceMinor: Number(s.priceMinor ?? 0) });

  /*
   * A booking fills ① in completely: the client, who it is with, and every leg at what it was BOOKED at.
   *
   * Booked, not catalogue: a price that has gone up since does not change what the client was quoted. The
   * booking carries its own name and price for exactly this reason, so the row's `priceMinor` is the quote.
   *
   * The client is shown, never sent: in this mode the write is `checkout(appointmentId)`, which already knows
   * whose visit it is. `Appointment` carries no `customerId`, only the name and number, and that is enough to
   * put a name at the top of the screen.
   */
  const visitFilled = useRef(false);
  useEffect(() => {
    if (!visit || visitFilled.current) return;
    visitFilled.current = true;
    const legs = [visit.appointment, ...visit.legs];
    setLines(
      legs.map((a) => ({
        serviceId: a.serviceId ?? '',
        name: a.serviceName ?? '',
        priceMinor: Number(a.priceMinor ?? 0),
      })),
    );
    setClient({ kind: 'named', name: visit.appointment.customerName ?? '' });
  }, [visit]);


  /*
   * The grid does not move once it is drawn (owner, 2026-10-10).
   *
   * Every service already on the bill used to be hoisted to the front, which meant tapping the sixth tile
   * sent it to the first — 336px up the screen, measured — and left the finger resting on a different
   * service at two and a half times the price. The gesture the screen is built around is "tap again for a
   * second one", so the one thing the grid must never do is reorder itself under that finger.
   *
   * What is pinned to the front is the TOKEN's services, which are fixed before the screen is drawn and
   * cannot move afterwards. What the owner picks from the search sheet is appended instead: it has to be
   * on screen to carry its count and its − +, but it joins the end rather than displacing anything.
   */
  const tiles = useMemo(() => {
    if (!services) return null;
    const rank = new Map((ranked ?? []).map((id, i) => [id, i]));
    const order = [...services].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    const pinned = new Set(token?.serviceIds ?? []);
    const shown = order.filter((s) => pinned.has(s.id));
    for (const s of order) {
      if (shown.length >= TILES) break;
      if (!pinned.has(s.id)) shown.push(s);
    }
    // A service found by searching is not a top seller by definition, so it has no tile yet. Give it one.
    const drawn = new Set(shown.map((s) => s.id));
    const byId = new Map(services.map((s) => [s.id, s]));
    for (const l of lines) {
      if (drawn.has(l.serviceId)) continue;
      const s = byId.get(l.serviceId);
      if (!s) continue;
      shown.push(s);
      drawn.add(s.id);
    }
    return shown;
  }, [services, ranked, token, lines]);

  /** Jira GRW-572 — the whole menu, most sold first: the wide till has room for all of it. */
  const ranked_all = useMemo(() => {
    if (!services) return [];
    const rank = new Map((ranked ?? []).map((id, i) => [id, i]));
    return [...services].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  }, [services, ranked]);

  /*
   * Jira GRW-572 — what each line is worth before anything is typed over the total: a single at its list
   * price, a package's legs at their shares of the package price (the one-page form's `splitComboRupees`
   * rule: by list price, the remainder on the last leg). `listMinor` is their sum — the bill as drawn — and
   * a typed total is then spread across THESE amounts, so a discount on the bill lands on the package and the
   * singles alike.
   */
  const baseAmounts = useMemo(() => {
    const out = lines.map((l) => lineMinor(l));
    const pkgKeys = [...new Set(lines.filter((l) => l.pkg).map((l) => l.pkg!.key))];
    for (const key of pkgKeys) {
      const at = lines.map((l, i) => (l.pkg?.key === key ? i : -1)).filter((i) => i >= 0);
      const shares = spread(at.map((i) => lines[i]!), lines[at[0]!]!.pkg!.priceMinor);
      at.forEach((i, k) => (out[i] = shares[k]!));
    }
    return out;
  }, [lines]);
  const listMinor = baseAmounts.reduce((sum, m) => sum + m, 0);
  const totalMinor = override ?? listMinor;
  /*
   * Jira GRW-725 — owner decision 2026-11-17: a discount that takes the bill to ₹0 is the owner's, with a typed reason.
   * Anyone else is told so and Pay stays shut; the owner is asked why. The server refuses the same (403 / 400) — this
   * is so the till says it before the tap, not after. However the ₹0 was reached: the Discount sheet, the typed total,
   * or a line typed down to nothing.
   */
  const isOwner = session?.role === 'owner';
  /*
   * Jira GRW-735 — the owner's offers on a bill of products rung up and paid here: the buy-get offers apply themselves,
   * a coupon when typed. Not on an order sent unpaid (its offers are taken where it is paid), a table's, a delivery app's,
   * or a bill with a service or a package on it. The server works them out the same way when the bill is sent.
   */
  const offersHere = Boolean(productsOnly && location && !fromApp && !atTable && !addingTo && !token && !visit && lines.length > 0 && lines.every((l) => l.product && !l.pkg));
  const couponOn = couponCode !== null && couponLost === null;
  const offersAsk = offersHere
    ? {
        location: location!,
        // A coupon goes on the bill at its list prices (it and the discount never stack); else the lines as they will be sent.
        products: groupProductLines(lines, couponOn ? baseAmounts : spread(baseAmounts.map((priceMinor) => ({ priceMinor })), totalMinor)).map((p) => ({ productId: p.productId, qty: p.qty, paidMinor: p.paidMinor })),
        couponCode: couponOn ? couponCode : null,
        discountMinor: listMinor - totalMinor,
        customerId: client.kind === 'existing' ? client.id : null,
        // L2 — a new guest's number, typed here: a per-guest coupon can be counted against them, so it is quoted (else refused, with the reason).
        ...(client.kind === 'named' && client.phone ? { customerPhone: client.phone } : {}),
        redeemMinor: pointsAsked,
        orderType: tablesHere && orderTab === 'dine_in' ? ('dine_in' as const) : ('takeaway' as const),
      }
    : null;
  const billOffers = useBillOffers(offersAsk);
  useEffect(() => {
    if (!couponOn || billOffers.checking || !billOffers.coupon) return;
    if (billOffers.kept === 'discount') setCouponLost(billOffers.coupon.name);
    else if (billOffers.kept === 'coupon') {
      // The coupon is larger: the discount comes off the bill, so the two never stack.
      setOverride(null);
      setDiscountPct(null);
    }
  }, [couponOn, billOffers.checking, billOffers.coupon, billOffers.kept]);
  /** What the bill comes to after its billOffers, before points (BR-03). */
  const afterOffersMinor = Math.max(0, totalMinor - (offersHere ? billOffers.offersMinor : 0));
  const freeBill = lines.length > 0 && isFreeBill(listMinor, afterOffersMinor);
  const freeBlock = lines.length > 0 ? freeBillBlock(listMinor, afterOffersMinor, isOwner, freeReason) : null;
  const freeReasonSent = freeBill && !freeBlock ? { discountReason: freeReason.trim() } : {};

  /*
   * Jira GRW-648 — the points, and what is left to collect once they come off.
   *
   * `totalMinor` stays the BILL: it is what the lines come to, it is what goes to the API (which does its own
   * netting, line by line), and it is what the bill card shows. `dueMinor` is the money that crosses the
   * counter, and it is what every way of paying has to add up to.
   *
   * Whose points: the client named on this sale, or — settling a booking — the one the booking was made for.
   * `customerId` is absent rather than null for a staff session the salon withholds client identity from, so
   * there is nothing to look up and nothing is offered, which is the right answer for that person.
   */
  const clientId = client.kind === 'existing' ? client.id : (visit?.appointment.customerId ?? null);
  /*
   * Jira GRW-648 — the quote, from the hook the visit sheet asks with too (`use-reward-quote.ts`), so the
   * two tills cannot answer the same question differently. An app's order is paid to the app, so it asks
   * for nobody's points.
   */
  const { rewards, usePoints, toggle: toggleRedeem, redeemPoints: quotedPoints, redeemMinor: discountMinor, checking: pointsChecking } = useRewardQuote(
    fromApp ? null : clientId,
    afterOffersMinor,
  );
  useEffect(() => setPointsAsked(discountMinor), [discountMinor]);
  /*
   * Jira GRW-736 — GST added on top: what the guest pays is the server's figure, the lines after their offers and the
   * points, and the GST on them. Prices that include GST: the bill after its offers, less the points, as before.
   */
  const taxOnTopNow = offersHere && billOffers.taxOnTop && billOffers.dueMinor !== null && pointsAsked === discountMinor;
  const dueMinor = taxOnTopNow ? billOffers.dueMinor! : Math.max(0, afterOffersMinor - discountMinor);

  /** Owner, 2026-10-15 — every package on the bill, one entry per time it was rung up, in the order picked. */
  const pkgsOnBill = useMemo(() => {
    const seen = new Map<string, NonNullable<Line['pkg']>>();
    for (const l of lines) if (l.pkg && !seen.has(l.pkg.key)) seen.set(l.pkg.key, l.pkg);
    return [...seen.values()];
  }, [lines]);
  const packageCountOf = (offerId: string) => pkgsOnBill.filter((p) => p.id === offerId).length;
  // A package's legs are not the tiles' count: − on a tile must not take a leg out of a package.
  const countOf = (serviceId: string) => lines.filter((l) => l.serviceId === serviceId && !l.pkg && !l.product).length;
  const productCountOf = (productId: string, variantId?: string) =>
    lines.filter((l) => l.product?.id === productId && (variantId === undefined || l.product.variantId === variantId)).length;
  /** Jira GRW-599 — the product whose sizes are open in the size sheet. Its sizes are the ones the till already read. */
  const [sizing, setSizing] = useState<string | null>(null);
  /*
   * Jira GRW-712 — a dish's add-on groups (Extras, Spice), read once for the till; `choosing` is the dish whose choice sheet is open.
   * A business with no add-ons never asks.
   */
  const addonsOn = useAddonsOn();
  const [addonGroups, setAddonGroups] = useState<{ groups: AddonGroup[]; products: Record<string, string[]> } | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  useEffect(() => {
    if (!addonsOn || !productsOnly) return;
    let live = true;
    void api.addonGroups().then((a) => live && setAddonGroups(a)).catch(() => {});
    return () => {
      live = false;
    };
  }, [addonsOn, productsOnly]);
  const groupsOf = (productId: string): AddonGroup[] =>
    (addonGroups?.products[productId] ?? []).map((id) => addonGroups!.groups.find((g) => g.id === id)).filter((g): g is AddonGroup => Boolean(g));
  // Hooks stay above every early return below (done, qr, how): a sale that ends on one of them must not change the hook count.
  const noneCount = useMemo(() => products.filter((p) => p.categoryId === null).length, [products]);
  /*
   * QA 2026-11-14 (F11) — only a category with something in it to sell. `products` is what the till can sell (the
   * branch's active ones), and a category whose every product was retired still drew a chip, which opened onto
   * "No service by that name." The category is still the shop's on the Stock screen; the till just has nothing in it.
   */
  const sellableCategories = useMemo(
    () => productCategories.filter((c) => products.some((p) => p.categoryId === c.id)),
    [productCategories, products],
  );
  useEffect(() => {
    if (productCategory === ALL_CATEGORIES || productCategory === NO_CATEGORY) return;
    if (productsLoaded && !sellableCategories.some((c) => c.id === productCategory)) setProductCategory(ALL_CATEGORIES);
  }, [productCategory, sellableCategories, productsLoaded]);
  const phoneProducts = useMemo(() => {
    if (!productsOnly) return [];
    const byCat = productCategory
      ? products.filter((p) => (productCategory === NO_CATEGORY ? p.categoryId === null : p.categoryId === productCategory))
      : products;
    // A kitchen has no shelf to be out of: every dish in the category is offered, in the order the menu reads.
    // Owner, 2026-11-17 — every dish, not the first eight: a menu of nine left the ninth reachable only by typing its name,
    // and the laptop till already shows them all. A shop that counts its shelf keeps its eight quick tiles and Search.
    const inStock = counted ? byCat.filter((p) => p.stock > 0 || productCountOf(p.id) > 0) : byCat;
    const shown = counted ? (inStock.length > 0 ? inStock : byCat).slice(0, TILES) : [...byCat];
    const drawn = new Set(shown.map((p) => p.id));
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const l of lines) {
      if (!l.product || drawn.has(l.product.id)) continue;
      const p = byId.get(l.product.id);
      if (!p) continue;
      shown.push(p);
      drawn.add(p.id);
    }
    return shown;
  }, [productsOnly, products, productCategory, lines, counted]);
  /** Jira GRW-576 — a walk-in can buy a product alone; settling a booking or token still needs a service. */
  const hasService = (visit || token) ? lines.some((l) => !l.product) : lines.length > 0;
  const full = lines.length >= MAX_LINES;

  /*
   * Felt only from a tap, never from a render: this sits in the handler and not in an effect on `lines`, because a
   * fast pair of taps re-renders more often than it adds and the phone would buzz continuously.
   */
  const felt = (pattern: number | readonly number[]) => {
    if (sound) buzz(pattern);
  };

  const addOne = (s: Service) => {
    if (full) {
      felt(BUZZ.tooMany);
      return;
    }
    felt(BUZZ.added);
    setLines((prev) => [...prev, toLine(s)]);
    setOverride(null);
  };
  /** Owner, 2026-10-14 — a product on the bill: one line per unit, so "tap again for a second one" holds. */
  const addProduct = (p: Product, size?: TillSize, again?: Line) => {
    // Jira GRW-712 FR-05 — "+" on a line with choices repeats exactly those choices.
    if (again?.product?.addons && again.product.addons.length > 0) {
      if (full) {
        felt(BUZZ.tooMany);
        return;
      }
      felt(BUZZ.added);
      setLines((prev) => [...prev, { ...again, override: undefined } as Line]);
      setOverride(null);
      return;
    }
    // Jira GRW-712 — a dish with add-on groups asks for its choices (and its portion) in one sheet.
    if (!size && groupsOf(p.id).length > 0) {
      setChoosing(p.id);
      return;
    }
    // Jira GRW-599 — a product with sizes is not one thing to ring up: the size sheet opens, and a size goes on from there.
    if (!size && hasSizes(p)) {
      setSizing(p.id);
      return;
    }
    if (size) {
      if (full || !canAddSize(size, productCountOf(p.id, size.id), counted)) {
        felt(BUZZ.tooMany);
        return;
      }
      felt(BUZZ.added);
      setLines((prev) => [...prev, { serviceId: '', name: sizedName(p, size), priceMinor: sizePriceMinor(p, size), product: { id: p.id, variantId: size.id } }]);
      setOverride(null);
      return;
    }
    if (full || (counted && (p.stock <= 0 || productCountOf(p.id) >= p.stock))) {
      felt(BUZZ.tooMany);
      return;
    }
    felt(BUZZ.added);
    setLines((prev) => [...prev, { serviceId: '', name: p.name, priceMinor: Number(p.priceMinor ?? 0), product: { id: p.id } }]);
    setOverride(null);
  };
  /** Jira GRW-712 — the choice sheet's Add: `qty` lines of the dish with its portion and add-ons, named and priced with them. */
  const addChoice = (p: Product, choice: DishChoice, qty: number) => {
    const room = Math.max(0, MAX_LINES - lines.length);
    const n = Math.min(qty, room);
    if (n === 0) {
      felt(BUZZ.tooMany);
      return;
    }
    felt(BUZZ.added);
    const line: Line = {
      serviceId: '',
      name: choice.name,
      priceMinor: choice.unitMinor,
      product: { id: p.id, ...(choice.size ? { variantId: choice.size.id } : {}), ...(choice.addons.length > 0 ? { addons: choice.addons } : {}) },
    };
    setLines((prev) => [...prev, ...Array.from({ length: n }, () => ({ ...line }))]);
    setOverride(null);
    setChoosing(null);
  };
  /**
   * Owner, 2026-10-19 — a scan adds the product wherever the cursor is. A code that names no single product says so
   * rather than doing nothing, because a silent miss at the counter reads as "the scanner is broken".
   */
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [queuedBanner, setQueuedBanner] = useState<{
    tokenNo: number | null;
    amountMinor: number;
    /** Jira GRW-713 — the order just sent, and its KOT, for Print KOT on the banner. */
    saleId?: string;
    kot?: KitchenSlips;
    channel?: string;
  } | null>(null);
  const printer = useTicketPrinter();
  useEffect(() => {
    if (lines.length > 0 && queuedBanner) setQueuedBanner(null);
  }, [lines.length, queuedBanner]);
  // A code that matched nothing goes into the search box: a person can edit it into a name and sell it by hand.
  const [searchSeed, setSearchSeed] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (!scanNote) return;
    const id = window.setTimeout(() => setScanNote(null), 5000);
    return () => window.clearTimeout(id);
  }, [scanNote]);
  const scanWords = (p: ScanProblem) => (p.kind === 'miss' ? t('desk.scanMiss', { code: p.code }) : p.kind === 'stock' ? t('desk.scanNoStock', { name: p.name }) : t('desk.scanFull'));
  /** One scan or a queue of them: each that can go on does, and the last that cannot is said out loud. */
  const onScans = (codes: readonly string[]) => {
    const { add, problem } = planScans(codes, products, productCountOf, lines.length, MAX_LINES, counted);
    // addProduct would refuse these quietly; a scan has no tile to show why, so it says.
    if (problem) felt(BUZZ.tooMany);
    setScanNote(problem ? scanWords(problem) : null);
    if (problem?.kind === 'miss') {
      setSearchSeed((prev) => ({ text: problem.code, n: (prev?.n ?? 0) + 1 }));
      if (!wide) setMenuOpen(true);
    }
    for (const a of add) addProduct(a.product, a.size);
  };
  // Only on the screen where products are picked: on 'how', 'qr' and 'done' a scan would change a bill being paid.
  // Listening from the first moment, not from when the shelf is in: a bottle scanned while it loads waits in the queue.
  /*
   * Owner, 2026-11-17 — "I placed a takeaway order and it's showing as Dine In". A table chosen on the till stayed chosen
   * across a visit to Queue or Return, with the Dine-in / Takeaway / Delivery tabs hidden behind it, so the next order
   * went on that table. Leaving Sell lets go of the table; the dishes already rung up stay, and wait for a table or a type.
   */
  useEffect(() => {
    if (!inactive) return;
    setAtTable(null);
    setGuests(null);
  }, [inactive]);

  useBarcodeScan(!inactive && productsOnly && step === 'what', (code) => {
    if (productsLoaded) onScans([code]);
    else queueScan(code);
  });
  /*
   * Owner, 2026-10-23 — and SAYS so on the two screens where it does not.
   *
   * Refusing the scan is right: on 'how' and 'qr' the total is already on screen and being paid against, and a
   * bottle that slipped onto the bill between the number and the money is how a till stops adding up. But the
   * refusal was silent, and silence at a counter reads as the broken scanner `scanMiss` was written to avoid —
   * the desk scans again, harder, then looks for the fault in the gun.
   *
   * So the same `scanNote` strip the picking screen already uses, with the way out in it: go back and add it.
   * Nothing is drawn until somebody actually scans, because a line of standing advice about a thing that is not
   * happening is what people stop reading.
   */
  useBarcodeScan(!inactive && productsOnly && (step === 'how' || step === 'qr'), () => setScanNote(t('desk.scanWhilePaying')));
  // Codes scanned on the Sales screen wait in the browser: put them on the bill once, in the order scanned.
  const scansTaken = useRef(false);
  useEffect(() => {
    if (!productsOnly || !productsLoaded || scansTaken.current) return;
    scansTaken.current = true;
    const waiting = takeScans();
    if (waiting.length === 0) return;
    // A shelf that failed to load is empty, not a shelf with nothing on it: say so rather than call each bottle unknown.
    if (productsFailed) setScanNote(t('desk.scanShelfFailed'));
    else onScans(waiting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsOnly, productsLoaded]);
  // No buzz on the way down: the count and the total both drop, and a removal that felt like an addition is a lie.
  const oneLess = (key: string) => {
    setLines((prev) => {
      // A package's row: every leg goes with it.
      if (prev.some((l) => l.pkg?.key === key)) return prev.filter((l) => l.pkg?.key !== key);
      const at = prev.map((l) => (l.pkg ? '' : lineKey(l))).lastIndexOf(key);
      return at < 0 ? prev : [...prev.slice(0, at), ...prev.slice(at + 1)];
    });
    setOverride(null);
  };
  const clearLine = (key: string) => {
    setLines((prev) => prev.filter((l) => (l.pkg ? l.pkg.key !== key : lineKey(l) !== key)));
    setOverride(null);
  };
  const clearBill = () => {
    setLines([]);
    setOverride(null);
    setSelectedMode(null);
    setBadMode(false);
  };
  /*
   * Restaurant QA 2026-10-24 — held bills are kept in the tab (`lib/held-bills`) under this branch and this person,
   * so a reload, or a look at Orders, no longer throws away a table's order that was put on hold.
   */
  type HeldBill = { id: string; heldAt: number; client: Client; lines: Line[]; override: number | null; from?: string; orderNo?: string };
  const heldKey = heldBillsKey(location, session?.phone ?? null);
  const [heldBills, setHeldBillsState] = useState<HeldBill[]>([]);
  useEffect(() => {
    setHeldBillsState(loadHeldBills<HeldBill>(heldKey));
  }, [heldKey]);
  const setHeldBills = (next: (prev: HeldBill[]) => HeldBill[]) =>
    setHeldBillsState((prev) => {
      const out = next(prev);
      saveHeldBills(heldKey, out);
      return out;
    });
  const holdBill = () => {
    if (lines.length === 0) return;
    setHeldBills((prev) => [{ id: newAttemptKey(), heldAt: heldStamp(), client, lines, override, from: orderFrom, orderNo: appOrderNo }, ...prev]);
    setOrderFrom('counter');
    setAppOrderNo('');
    setLines([]);
    setOverride(null);
    setClient({ kind: 'none' });
    setSelectedMode(null);
    setBadMode(false);
    setMissing(null);
    setError(null);
  };
  const resumeHeldBill = (id: string) => {
    const found = heldBills.find((h) => h.id === id);
    if (!found) return;
    setHeldBills((prev) => prev.filter((h) => h.id !== id));
    setClient(found.client);
    setLines(found.lines);
    setOverride(found.override);
    setOrderFrom(found.from ?? 'counter');
    // A held Swiggy bill comes back under Delivery; a counter bill never stays under it (it would be given an app).
    if (tablesHere) {
      if (found.from && apps.includes(found.from)) setOrderTab('delivery');
      else if (orderTab === 'delivery') setOrderTab('takeaway');
    }
    setAppOrderNo(found.orderNo ?? '');
    setSelectedMode(null);
    setBadMode(false);
    setMissing(null);
    setError(null);
  };
  const discardHeldBill = (id: string) => {
    setHeldBills((prev) => prev.filter((h) => h.id !== id));
  };
  /*
   * Owner, 2026-10-14 — a price typed for one row. A single's row may be two of the same service, so the typed
   * figure is the row's total, spread over its lines by list price; a package row's figure is the package price.
   * Either way the whole-bill override is cleared: the bill is now the sum of what each line says.
   */
  const setRowPrice = (key: string, minor: number) => {
    setLines((prev) => {
      if (prev.some((l) => l.pkg?.key === key)) return prev.map((l) => (l.pkg?.key === key ? { ...l, pkg: { ...l.pkg!, priceMinor: minor } } : l));
      const at = prev.map((l, i) => (!l.pkg && lineKey(l) === key ? i : -1)).filter((i) => i >= 0);
      if (at.length === 0) return prev;
      const shares = spread(at.map((i) => prev[i]!), minor);
      const next = [...prev];
      at.forEach((i, k) => (next[i] = { ...prev[i]!, paidMinor: shares[k]! }));
      return next;
    });
    setOverride(null);
  };
  const openRowKeypad = (key: string) => {
    const pkgLine = lines.find((l) => l.pkg?.key === key);
    if (pkgLine) {
      setKeypadFor({ key, name: pkgLine.pkg!.title, list: pkgLine.pkg!.priceMinor });
      setKeypad(rupeesText(pkgLine.pkg!.priceMinor));
      return;
    }
    const own = lines.filter((l) => !l.pkg && lineKey(l) === key);
    if (own.length === 0) return;
    const list = own.reduce((sum, l) => sum + l.priceMinor, 0);
    setKeypadFor({ key, name: own[0]!.name, list });
    setKeypad(rupeesText(own.reduce((sum, l) => sum + lineMinor(l), 0)));
  };

  /*
   * Jira GRW-572 — a package joins the bill beside the singles (owner, 2026-10-07: a facial rung up, then a package
   * picked, must not lose the facial). Owner, 2026-10-15 — and a second package must not lose the first: every
   * pick adds one more, the same package included (two bridal packages for two sisters); − on the tile takes the
   * last one off. Its legs are lines like any other — the route gets each with its share and its own offer id.
   */
  /** Each copy of a package gets its own key; a counter, because two picks can land in the same millisecond. */
  const packageSeq = useRef(0);
  const pickPackage = (o: Offer) => {
    if (!services) return;
    const byId = new Map(services.map((s) => [s.id, s]));
    const legs = o.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => Boolean(s));
    const pkg = { id: o.id, key: `${o.id}#${++packageSeq.current}`, title: o.title, priceMinor: Number(o.comboPriceMinor ?? 0) };
    setLines((prev) => {
      if (legs.length === 0) return prev;
      if (prev.length + legs.length > MAX_LINES) {
        felt(BUZZ.tooMany);
        return prev;
      }
      felt(BUZZ.added);
      return [...prev, ...legs.map((s) => ({ ...toLine(s), pkg }))];
    });
    setOverride(null);
  };
  /** The last of that package off the bill, legs and all. */
  const oneLessPackage = (offerId: string) => {
    setLines((prev) => {
      const last = [...prev].reverse().find((l) => l.pkg?.id === offerId)?.pkg?.key;
      return last ? prev.filter((l) => l.pkg?.key !== last) : prev;
    });
    setOverride(null);
  };
  const pickStylist = (id: string | null) => {
    setStylistId(id);
    remember(STYLIST_KEY, id ?? 'nobody');
  };
  const toggleSound = () => {
    setSound((on) => {
      remember(SOUND_KEY, on ? 'off' : 'on');
      return !on;
    });
  };

  const money = (minor: number) => formatMoney(String(minor));
  const modeWord = (mode: PaymentMode) => (PAYMENT_MODES.some((m) => m.value === mode) ? tcr(`pay.${mode}`) : mode);
  /** The ways this bill is paid when the tile `mode` is tapped: two when a first way is held and differs, else one. */
  // Jira GRW-648 — `dueMinor`, not `totalMinor`: the ways of paying add up to the money that crossed the
  // counter, and points are not one of them. With no points on the bill the two are the same number.
  /** QA 2026-11-17, finding 2 — a held first part not less than the (new) total is said, never dropped silently. */
  const splitTooBig = firstWay !== null && firstWay.minor >= dueMinor;
  const waysFor = (mode: PaymentMode): Array<{ mode: PaymentMode; amountMinor: number }> => {
    if (!firstWay || firstWay.mode === mode || firstWay.minor >= dueMinor) return [{ mode, amountMinor: dueMinor }];
    return [
      { mode: firstWay.mode, amountMinor: firstWay.minor },
      { mode, amountMinor: dueMinor - firstWay.minor },
    ];
  };
  const paidByWords = (ways: Array<{ mode: PaymentMode; amountMinor: number }>) =>
    ways.length > 1 ? ways.map((w) => `${modeWord(w.mode)} ${money(w.amountMinor)}`).join(' · ') : modeWord(ways[0]!.mode);
  const clearSplit = () => {
    setSplitting(false);
    setSplitKeypad(null);
    setSplitAmount('');
    setFirstWay(null);
    setSelectedMode(null);
    setBadMode(false);
  };

  /*
   * QA of the overnight stack (item 1) — what is owed is still being asked: this bill's points (QA 2026-11-17, finding 1),
   * or its offers and the GST on top (Jira GRW-735 / GRW-736). A tap then used to do NOTHING — "Complete sale" tapped
   * within ~300 ms of a change was silently dropped. Now the tap is held: the button shows it is busy and is disabled, and
   * the sale completes the moment the quote is in, on the figures it brought.
   */
  const quoting = pointsChecking || (offersHere && (billOffers.checking || (billOffers.taxOnTop && !taxOnTopNow)));
  const [heldTap, setHeldTap] = useState<{ mode: PaymentMode; pending: boolean } | null>(null);

  /** ② — the tile that was tapped is the payment; this is the save. */
  const pay = async (mode: PaymentMode, pending = false) => {
    if (saving || lines.length === 0 || freeBlock || splitTooBig) return;
    felt(BUZZ.paid);
    setSaving(mode);
    setError(null);
    if (quoting) {
      setHeldTap({ mode, pending });
      return;
    }
    await completePay(mode, pending);
  };

  /** The save itself, once what is owed is known. */
  const completePay = async (mode: PaymentMode, pending: boolean) => {
    const amounts = spread(baseAmounts.map((priceMinor) => ({ priceMinor })), totalMinor);
    // Jira GRW-648 — how many points this bill spends: all the till offered, or none.
    const redeemPoints = quotedPoints;
    const legs = lines.flatMap((l, i) => (l.product ? [] : [{ serviceId: l.serviceId, paidAmountMinor: amounts[i]!, ...(l.pkg ? { offerId: l.pkg.id } : {}) }]));
    // Owner, 2026-10-14 — the products on the bill, grouped: which, how many, what the line came to.
    // Jira GRW-599 — one entry per product, and per size of a product that has sizes (the size is what the server takes the unit from).
    const productLines = groupProductLines(lines, amounts);
    const soldProducts = productLines.length > 0 ? { products: productLines } : {};
    // Owner, 2026-10-14 — a bill paid two ways goes as `payments`; the legs' one word is the larger way's.
    const ways = waysFor(mode);
    // On the receipt this reads "Paid by Swiggy"; on the done screen, the app's name where a way of paying would be.
    const paidBy = pending ? t('desk.paymentPending') : fromApp ? appWord(fromApp) : paidByWords(ways);
    const mainMode = ways.reduce((best, w) => (w.amountMinor > best.amountMinor ? w : best), ways[0]!).mode;
    const howPaid = ways.length > 1 ? { paymentMode: mainMode, payments: ways } : { paymentMode: mode };
    /**
     * Jira GRW-716 — the receipt for an order taken offline, from what the till has: the dishes and what was paid for
     * them, the token, and no bill number — the server gives the next one when the order is sent (owner, 2026-11-16).
     * The taxes are the GST bill's to work out, and it can be printed from the order once it has reached us.
     */
    const offlineReceipt = (offlineToken: string, paidWords: string, paidTotal: number, atISO: string): BillData => {
      const figure = (minor: number) => new Intl.NumberFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
      const items = productLines.map((p) => ({
        name: lines.find((l) => l.product?.id === p.productId)?.name ?? '',
        qty: p.qty,
        price: figure(Math.round(p.paidMinor / Math.max(1, p.qty))),
        amount: figure(p.paidMinor),
      }));
      return {
        businessName: session?.businessName ?? '',
        docTitle: t('offline.receiptTitle'),
        customerName: client.kind === 'existing' ? (client.name ?? null) : client.kind === 'none' ? null : (client as { name: string }).name || null,
        when: new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone })
          .format(new Date(atISO))
          .replace(',', ''),
        orderLabel: null,
        cashier: session?.name ?? null,
        number: null,
        tokenNo: null,
        offlineToken,
        numberLater: t('offline.numberLater'),
        items,
        totalQty: productLines.reduce((n, p) => n + p.qty, 0),
        subTotal: figure(paidTotal),
        adjustments: [],
        roundOff: null,
        grandTotal: money(paidTotal),
        paidBy: t('offline.paidBy', { ways: paidWords }),
      };
    };
    try {
      /*
       * Two writes, chosen by what is being paid for — the whole reason this screen can serve both.
       *
       * A walk-in's payment CREATES the visit: `recordCounterSale`. A booking's payment COMPLETES rows that
       * already exist: `checkout`. Sending a sale for a booking would take the money correctly and leave the
       * booking `confirmed` for ever beside a duplicate visit, which is the one mistake worth the branch.
       *
       * `checkout` takes the ORIGINAL leg's amount directly and everything else as `extraServices`; a leg of
       * the booking the client did not have is `cancelMemberIds`, which releases its chair. The booked legs
       * still on the bill are matched by service, so a line the desk removed cancels rather than lingering.
       */
      const settled = visit
        ? await (async () => {
            const booked = [visit.appointment, ...visit.legs];
            const left = new Map<string, string[]>();
            for (const a of booked) left.set(a.serviceId ?? '', [...(left.get(a.serviceId ?? '') ?? []), a.id]);
            const take = (serviceId: string) => left.get(serviceId)?.shift() ?? null;
            // The leg the checkout is addressed to keeps its own amount; anything matched after it rides as a group member.
            const originalIdx = lines.findIndex((l) => l.serviceId === visit.appointment.serviceId);
            if (originalIdx >= 0) take(visit.appointment.serviceId ?? '');
            const groupMembers: Array<{ appointmentId: string; paidAmountMinor: number; schedulableId?: string }> = [];
            const extraServices: Array<{ serviceId: string; paidAmountMinor: number; schedulableId?: string }> = [];
            lines.forEach((l, i) => {
              if (i === originalIdx || l.product) return;
              const id = take(l.serviceId);
              if (id) groupMembers.push({ appointmentId: id, paidAmountMinor: amounts[i]!, ...(stylistId ? { schedulableId: stylistId } : {}) });
              else extraServices.push({ serviceId: l.serviceId, paidAmountMinor: amounts[i]!, ...(stylistId ? { schedulableId: stylistId } : {}) });
            });
            // Whatever of the booking nobody claimed: the client did not have it.
            const cancelMemberIds = [...left.values()].flat().filter((id) => id !== visit.appointment.id);
            const r = await guard((confirmed) =>
              api.checkout(visit.appointment.id, {
                ...(originalIdx >= 0 ? { paidAmountMinor: amounts[originalIdx]! } : {}),
                ...(stylistId ? { schedulableId: stylistId } : {}),
                ...howPaid,
                ...soldProducts,
                ...(extraServices.length ? { extraServices } : {}),
                ...(groupMembers.length ? { groupMembers } : {}),
                ...(cancelMemberIds.length ? { cancelMemberIds } : {}),
                // Jira GRW-648 — the points, with the GROSS lines: the API takes them off the lines itself.
                ...(redeemPoints > 0 ? { redeemPoints } : {}),
                ...freeReasonSent,
                ...(confirmed ? { confirmLargeAmount: true } : {}),
              }),
            );
            return {
              appointmentId: r.appointmentId,
              // What the customer handed over. With points on the bill that is less than the lines come to.
              paidMinor: dueMinor,
              schedulableId: stylistId,
              startAt: visit.appointment.startAt,
              tokenNo: null as number | null,
              earnedPoints: r.rewards?.earnedPoints ?? 0,
              rewards: r.rewards ?? null,
              kot: undefined as KitchenSlips | undefined,
              offlineToken: undefined as string | undefined,
            };
          })()
        : await (async () => {
            // No client is only ever an app's order (the guest is the app's); every other sale names one before it gets here.
            // Jira GRW-716 — a guest added offline carries their number on the order; the server finds or makes them by it.
            const named = client as { name: string; phone?: string | null };
            const who = token ? { queueEntryId: token.id } : client.kind === 'existing' ? { customerId: client.id } : client.kind === 'none' ? {} : { ...(named.name ? { customerName: named.name } : {}), ...(named.phone ? { customerPhone: named.phone } : {}) };
            const appOrder = fromApp ? { channel: fromApp, ...(appOrderNo.trim() ? { externalRef: appOrderNo.trim() } : {}) } : null;
            const common = {
              ...who,
              services: legs,
              ...howPaid,
              ...(pending ? { paymentPending: true } : {}),
              // An app's order is paid to the app: the till says where it came from (the server takes it as "other").
              ...(appOrder ?? {}),
              ...soldProducts,
              ...(redeemPoints > 0 ? { redeemPoints } : {}),
              ...freeReasonSent,
              // Jira GRW-735 — a kept coupon, by its code; the server takes it and the buy-get offers off the lines itself.
              ...(offersHere && couponOn && billOffers.couponKept ? { couponCode: couponCode! } : {}),
              idempotencyKey: attemptKey,
              ...(token || !location ? {} : { location }),
              // Jira GRW-720 — how it is eaten; an app's order is a delivery by where it came from and names none.
              ...(atTable
                ? { tableId: atTable.id, ...(atTable.billId ? { tableBillId: atTable.billId } : {}), ...(atTable.seated ? { tableSeated: true } : {}), ...(guests ? { guests } : {}) }
                : tablesHere && !fromApp
                  ? { orderType: orderTab === 'dine_in' ? ('dine_in' as const) : ('takeaway' as const) }
                  : {}),
            };
            /*
             * Jira GRW-716 — no internet: a paid counter order of products is kept on this device under the till's own
             * token ("A12") and sent when the connection is back. Only when the request never reached us (or the browser
             * already knows it is offline): a refusal from the server is the server's answer, never taken offline.
             */
            const tillAt = location && !token && !atTable && !pending && !fromApp && legs.length === 0 && redeemPoints === 0 ? location : null;
            const letter = tillAt ? tillLetter(tillAt) : null;
            const keepOffline = () => {
              const device = deviceKey();
              if (!tillAt || !letter || !device) return null;
              const takenAt = new Date();
              const n = nextOfflineCount(tillAt, new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(takenAt));
              const offlineToken = offlineTokenOf(letter, n);
              const body: OfflineOrderBody = { ...common, noStylist: true, location: tillAt, idempotencyKey: attemptKey, offline: { deviceKey: device, tokenNo: n, takenAt: takenAt.toISOString() } };
              if (!keepOfflineOrder({ id: attemptKey, branch: tillAt, token: offlineToken, takenAt: takenAt.toISOString(), totalMinor: dueMinor, body })) return null;
              // Jira GRW-730 — the slip printed offline names whoever is at this till, as the server's would.
              const kot: KitchenTicketDto = { id: attemptKey, number: 0, kind: 'new', createdAt: takenAt.toISOString(), items: productLines.map((p) => ({ name: lines.find((l) => l.product?.id === p.productId)?.name ?? '', qty: p.qty })), takenBy: session?.name?.trim() || null };
              return { appointmentId: attemptKey, tokenNo: null, offlineToken, legs: [], schedulableId: null, startAt: takenAt.toISOString(), rewards: undefined, kot };
            };
            const kept = tillAt && letter && typeof navigator !== 'undefined' && navigator.onLine === false ? keepOffline() : null;
            const r =
              kept ??
              (await guard((confirmed) =>
                api.recordCounterSale(
                  stylistId && legs.length > 0
                    ? { ...common, schedulableId: stylistId, ...(confirmed ? { confirmLargeAmount: true } : {}) }
                    : { ...common, noStylist: true, ...(confirmed ? { confirmLargeAmount: true } : {}) },
                ),
              ).catch((e: unknown) => {
                const held = neverArrived(e) ? keepOffline() : null;
                if (held) return held;
                throw e;
              }));
            return {
              appointmentId: r.appointmentId,
              /*
               * Owner, 2026-10-14 — the legs are the services; the products on the bill are the rest of what was paid.
               *
               * Jira GRW-648 — and `dueMinor` when points came off, because these two are not the same thing
               * any more: the legs come back NET of the reward discount and the product lines are the gross
               * figures this request sent, so adding them would count the discount once and not the other.
               */
              paidMinor: redeemPoints > 0 || (offersHere && billOffers.offersMinor > 0) ? dueMinor : r.legs.reduce((sum, l) => sum + l.paidAmountMinor, 0) + productLines.reduce((sum, p) => sum + p.paidMinor, 0),
              schedulableId: r.schedulableId,
              startAt: r.startAt,
              tokenNo: r.tokenNo ?? null,
              earnedPoints: r.rewards?.earnedPoints ?? 0,
              rewards: r.rewards ?? null,
              // Jira GRW-713 — the kitchen's ticket for this order, printed below if this counter prints them. Jira GRW-733 — every station's.
              kot: 'kots' in r ? slipsOf(r) : r.kot,
              offlineToken: 'offlineToken' in r ? (r.offlineToken ?? undefined) : undefined,
            };
          })();
      const result = settled;
      // Jira GRW-716 — offline there is nothing to read again; the screen refreshes when the order is sent.
      if (!result.offlineToken) router.refresh();
      const paidMinor = pending ? totalMinor : result.paidMinor;
      const stylist = result.schedulableId ? (shownProviders.find((p) => p.id === result.schedulableId)?.displayName ?? null) : null;
      const when = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
        timeZone: timezone,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(result.startAt));
      // Jira GRW-716 — an order taken offline goes by its till's token, never by a guessed next number.
      const offlineToken = result.offlineToken;
      const tokenNo = offlineToken ? null : (result.tokenNo ?? token?.tokenNo ?? nextTokenNo ?? null);
      onSaleCompleted?.(result.appointmentId);
      // Jira GRW-713 — the kitchen's ticket and the guest's bill. After the sale is saved, never in its way (BR-03).
      const channel = fromApp ?? 'counter';
      // Jira GRW-720 — the slip says how it is eaten ("TAKEAWAY"); the server decided the same from the same choice.
      const orderType = fromApp ? ('delivery' as const) : tablesHere && orderTab === 'dine_in' ? ('dine_in' as const) : ('takeaway' as const);
      printer.autoKot(result.kot, { tokenNo, offlineToken, channel, orderType, ...(atTable ? { tableName: atTable.label } : {}) });
      // Jira GRW-721 — sent to a table: back to the map, which reads again and shows the table busy.
      if (pending && atTable) {
        nextCustomer();
        setTableSent(tTables('sent', { table: atTable.label }));
        setAtTable(null);
        setGuests(null);
        setMapKey((k) => k + 1);
        return;
      }
      if (pending) {
        nextCustomer();
        setQueuedBanner({ tokenNo, amountMinor: paidMinor, saleId: result.appointmentId, kot: result.kot, channel });
        return;
      }
      // A delivery app bills its own guest, and issuing has no client of ours to name: only the counter's own bills print.
      // Jira GRW-716 — offline: the receipt the till builds itself, with no bill number yet (owner, 2026-11-16).
      const receipt = offlineToken ? offlineReceipt(offlineToken, paidBy, paidMinor, result.startAt) : undefined;
      if (receipt) printer.autoReceipt(receipt);
      else if (productsOnly && channel === 'counter') printer.autoBill(result.appointmentId);
      const bill = receiptRows(
        {
          businessName: session?.businessName ?? null,
          branchName,
          when,
          tokenNo,
          stylist,
          // Each line at its own price; a whole-bill figure is the one Discount (or Added) row below them.
          singles: lines.map((l, i) => ({ name: l.name, amountMinor: baseAmounts[i]! })).filter((_, i) => !lines[i]!.pkg && !lines[i]!.product),
          products: lines.map((l, i) => ({ name: l.name, amountMinor: baseAmounts[i]! })).filter((_, i) => lines[i]!.product),
          pkg: null,
          pkgs: pkgsOnBill.map((pkg) => ({
            title: pkg.title,
            services: lines.filter((l) => l.pkg?.key === pkg.key).map((l) => l.name),
            paidMinor: baseAmounts.reduce((sum, a, i) => sum + (lines[i]!.pkg?.key === pkg.key ? a : 0), 0),
            separateMinor: lines.filter((l) => l.pkg?.key === pkg.key).reduce((sum, l) => sum + l.priceMinor, 0),
          })),
          totalMinor: paidMinor,
          adjustMinor: totalMinor - listMinor,
          // Owner, 2026-11-15 — "Discount (10%): −₹38" on the WhatsApp receipt when the counter gave a percentage.
          discountPct: offPct,
          /*
           * Jira GRW-648, owner 2026-10-27 — the whole reward story, in one field.
           *
           * It used to hand over two loose numbers, `rewardPoints` and `earnedPoints`, and the receipt could
           * only ever say what this bill did. The customer's own question -- how many have I got now? -- had
           * no answer on the one piece of paper they keep. `rewards` carries the balance as well, and the
           * builder prints the three together under a heading of their own.
           */
          ...(result.rewards
            ? {
                rewards: {
                  earnedPoints: result.rewards.earnedPoints,
                  redeemedPoints: result.rewards.redeemedPoints,
                  redeemedMinor: result.rewards.discountMinor,
                  ...(result.rewards.balanceAfter !== null ? { balancePoints: result.rewards.balanceAfter } : {}),
                  // What one point is worth here, so the balance line can price itself. Absent from an API a
                  // deploy behind, and then the sentence simply says the points, as it always did.
                  ...(result.rewards.pointValueMinor ? { pointValueMinor: result.rewards.pointValueMinor } : {}),
                  // And what the till would actually honour next time, so the line cannot promise more (QA 2026-10-28).
                  ...(result.rewards.spendableAfter !== undefined ? { spendableAfter: result.rewards.spendableAfter } : {}),
                  ...(result.rewards.minRedeemPoints !== undefined ? { minRedeemPoints: result.rewards.minRedeemPoints } : {}),
                  /*
                   * And the date on that promise — QA 2026-10-27 (loophole L4). The receipt said "you now
                   * have 420 points" and never that points die; a number with no date on it is a promise
                   * the business has not made. Formatted here, where the salon's zone and the reader's
                   * language are: the builder does no dates.
                   */
                  ...(result.rewards.expiring
                    ? {
                        expiringPoints: result.rewards.expiring.points,
                        expiringOn: formatDate(result.rewards.expiring.atISO, timezone, locale),
                      }
                    : {}),
                },
              }
            : {}),
          paidBy,
          googleReviewUrl,
        },
        {
          title: nv.receiptTitle,
          thanks: nv.receiptThanks,
          services: nv.receiptServices,
          // The vertical's own word for what was sold: Menu to a restaurant, Products to a shop. The receipt is
          // the one piece of this the GUEST reads, so it least of all should carry another trade's noun.
          products: pickNoun(locale, productsNoun, nv.receiptProducts),
          token: nv.token,
          stylist: (name) => nv.receiptStylist(providerNoun, name),
          packageName: nv.receiptPackage,
          separately: nv.receiptSeparately,
          total: nv.receiptTotal,
          discount: nv.receiptDiscount,
          extra: nv.receiptExtra,
          saved: nv.receiptSaved,
          rewardsTitle: t('rewards.receiptTitle'),
          rewardRedeemed: (points, amount) => t('rewards.receiptUsed', { points, amount }),
          rewardEarned: (points) => t('rewards.receiptEarned', { points }),
          rewardBalance: (points, worth) => (worth ? t('rewards.receiptBalance', { points, worth }) : t('rewards.receiptBalanceOnly', { points })),
          rewardExpiry: (points, date) => t('rewards.receiptExpiry', { points, date }),
          paidBy: nv.receiptPaidBy,
          seeYou: nv.receiptSeeYou,
          reviewPrompt: nv.receiptReviewPrompt,
        },
        money,
      );
      const names = [...new Set(lines.map((l) => l.pkg?.title ?? l.name))].join(' + ');
      setSale({
        appointmentId: result.appointmentId,
        tokenNo,
        ...(pending
          ? { title: t(qk('desk.pendingDoneTitle'), { amount: money(paidMinor) }) }
          : fromApp
            ? { title: t('from.doneTitle', { amount: money(paidMinor), app: appWord(fromApp) }) }
            : {}),
        totalMinor: paidMinor,
        mode: mainMode,
        paidBy,
        bill,
        /*
         * Whose number the receipt is sent to.
         *
         * A booking's client is held as `named` — `Appointment` carries no `customerId`, and the write does
         * not need one — so asking `client` for a phone gives nothing and the done screen's WhatsApp box came
         * up empty for a client who has a number on file. The booking has it; take it from there.
         */
        phone: token?.customerPhone ?? visit?.appointment.customerPhone ?? (client.kind === 'existing' ? client.phone : null),
        /* Jira GRW-648 — and what it earned them, because "that earned her 38 points" is the sentence the
           desk says out loud, and the one reason a client cares that any of this exists. */
        summary: [
          offlineToken ?? (tokenNo !== null ? nv.token(tokenNo) : null),
          offlineToken ? t('offline.keptShort') : null,
          paidBy,
          names,
          stylist,
          result.earnedPoints > 0 ? t('rewards.earnedDone', { points: result.earnedPoints }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        day: new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(result.startAt)),
        productOnly: !lines.some((l) => !l.product),
        ...(result.kot ? { kot: result.kot } : {}),
        channel,
        ...(offlineToken ? { offlineToken, receipt } : {}),
      });
      clearSplit();
      setStep('done');
    } catch (e) {
      if (e instanceof LargeAmountDeclined) setError(nv.amountNotSaved);
      else {
        // Jira GRW-599 — a size sold out or retired elsewhere while this bill was open: said plainly (a size changed — look at the
        // sizes), and the shelf is read again so the sizes shown are the ones that are really there. Only when the server
        // named a SIZE (its `variantId`): any other refusal about a product keeps its own words (review of GRW-585).
        const sizeRefused = e instanceof ApiError && e.field === 'products' && typeof (e.body as { variantId?: unknown } | undefined)?.variantId === 'string';
        // Jira GRW-716 — no internet, and this is not an order the till can keep (the Queue, a table, points, a service):
        // said plainly, so the counter knows to take it as a paid counter order or wait for the connection.
        setError(sizeRefused ? ts('changed') : neverArrived(e) ? t('offline.notKept') : e instanceof ApiError ? e.message : nv.saveUnknown);
        if (e instanceof ApiError && e.field === 'products') void api.products(location).then(setProducts).catch(() => {});
      }
    } finally {
      setSaving(null);
    }
  };

  // The held tap goes through as soon as the quote is in — or is let go, if the bill can no longer be paid as it stands.
  useEffect(() => {
    if (!heldTap || quoting) return;
    const tap = heldTap;
    setHeldTap(null);
    if (lines.length === 0 || freeBlock || splitTooBig) {
      setSaving(null);
      return;
    }
    void completePay(tap.mode, tap.pending);
    // completePay is this render's: it reads the figures the quote just brought.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldTap, quoting]);



  const nextCustomer = () => {
    setLines([]);
    // Owner, 2026-11-17 — a finished bill lets go of its table: the next guest is not seated there by default.
    setAtTable(null);
    setGuests(null);
    setOverride(null);
    setClient({ kind: 'none' });
    setOrderFrom('counter');
    setAppOrderNo('');
    setSale(null);
    setError(null);
    setAttemptKey(newAttemptKey());
    clearSplit();
    void api.products(location).then(setProducts).catch(() => {});
    if (productsOnly && location) void api.productCategories(location).then(setProductCategories).catch(() => {});
    tokenFilled.current = true; // a token has been paid: a second sale from this page is a plain one
    // The address names the bill being left. After a payment the refresh has already dropped `token` / `visit`, so the
    // "gone" flags are what say the address still carries one: without them the banner stays up over a fresh till.
    if (token || tokenGone || visit || visitGone) router.replace(nextCustomerHref({ from: backTo ? 'bookings' : undefined }));
    setStep('what');
  };

  /*
   * A sale needs somebody's name (owner, 2026-10-10).
   *
   * There is no anonymous sale any more: the route still accepts a bare name, so nothing here demands a number,
   * but it does demand that the salon knows who it served. A token already carries its client, so it never asks.
   */
  /*
   * Changing branch empties the bill (owner, 2026-10-10).
   *
   * A service belongs to ONE branch (GRW-376) and so does a stylist, so a bill built at MG Road is not a bill
   * Indiranagar can take: the route would refuse the lines (`ServiceNotAtBranchError`) and the stylist
   * (`ProviderAtAnotherBranchError`), and the desk would get a 400 it did not cause. Clearing on the way is
   * honest about what a branch switch means. The client is kept — a person is not the branch's.
   *
   * Never on the first render, and never for a token: a token's branch is the token's and cannot be changed.
   */
  const branchWas = useRef(location);
  useEffect(() => {
    if (token || branchWas.current === location) return;
    branchWas.current = location;
    setLines([]);
    setOverride(null);
    setStylistId(null);
    setProductCategory(ALL_CATEGORIES);
    setError(null);
    setFirstWay(null);
    setSplitting(false);
    setSelectedMode(null);
    setBadMode(false);
  }, [location, token]);

  const guestOptional = productsOnly && !counted;
  const canGoOn = hasService && (token !== undefined || client.kind !== 'none' || fromApp !== null);
  /*
   * Both complaints at once (owner, 2026-10-10).
   *
   * Next used to stop at the first thing missing: with neither a client nor a service it said only "Tap a
   * service first", and the owner learnt about the client on the NEXT tap. Two round trips to be told two
   * things the screen already knew. Each is now marked where it is missing, so one look answers both.
   */
  const onNext = () => {
    if (addingTo) {
      void addToOrder();
      return;
    }
    const service = !hasService;
    const client_ = !token && client.kind === 'none' && !fromApp && !guestOptional;
    if (service || client_) {
      setMissing({ client: client_, service });
      // The sheet opens over the screen, so it may only open when the client is the ONE thing missing —
      // otherwise it would cover the mark that says a service is missing too.
      if (client_ && !service) setWhoOpen('add');
      return;
    }
    setMissing(null);
    // An app's order has nothing to collect: no "how did they pay" step.
    if (fromApp) {
      void pay('other');
      return;
    }
    setStep('how');
  };

  /**
   * Jira GRW-572 — the wide till has no Next: a payment tile does Next's check first, and marks what is missing.
   * Jira GRW-747 — where a bill needs no guest, nobody is missing: it is paid as Walk-in (FR-01).
   */
  const readyToPay = () => {
    const service = !hasService;
    const client_ = !token && client.kind === 'none' && !fromApp && !guestOptional;
    if (service || client_) {
      setMissing({ client: client_, service });
      if (client_ && !service) setWhoOpen('add');
      return false;
    }
    setMissing(null);
    return true;
  };

  // Marked only while still true, so answering one clears its own mark without clearing the other's.
  const badClient = Boolean(missing?.client) && !token && client.kind === 'none' && !fromApp;
  const badService = Boolean(missing?.service) && !hasService;

  // Progressive step guidance on the wide POS order card:
  // 1) Dishes added → highlight Guest input (`guideClient`)
  // 2) Guest picked → highlight Payment mode tiles (`guideMode`)
  // 3) Payment mode picked (or delivery app order) → light up Complete sale (`guideReady`)
  const hasWho = Boolean(token) || client.kind !== 'none';
  /*
   * Jira GRW-747 (FR-01) — owner, 2026-11-22: a takeaway needs no guest. The payment tiles used to be held back until one
   * was added (`hidePayUntilGuest`, GRW-679), so a guest who would not give a number was invented or parked in Pickup.
   * Where the guest is optional the tiles now show as soon as a dish is on the bill, and the next step after the dishes
   * is how it is paid, not who.
   */
  const whoDone = hasWho || guestOptional;
  const guideClient = Boolean(productsOnly && wide && lines.length > 0 && !whoDone && !fromApp && !badClient);
  const guideMode = Boolean(productsOnly && wide && lines.length > 0 && whoDone && !fromApp && !selectedMode && !splitting && !firstWay);
  const guideReady = Boolean(productsOnly && wide && lines.length > 0 && (fromApp !== null || (whoDone && (selectedMode !== null || firstWay !== null))));

  const [addingBusy, setAddingBusy] = useState(false);
  const addToOrder = async () => {
    if (!addingTo || addingBusy) return;
    if (lines.length === 0) {
      setMissing({ client: false, service: true });
      return;
    }
    setMissing(null);
    setError(null);
    setAddingBusy(true);
    try {
      const amounts = spread(baseAmounts.map((priceMinor) => ({ priceMinor })), totalMinor);
      await addingTo.onAdd(groupProductLines(lines, amounts));
      nextCustomer();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('desk.addToOrderFailed'));
    } finally {
      setAddingBusy(false);
    }
  };
  const addingBanner = addingTo ? (
    <div className="pos-charge-adding" role="status">
      <span className="pos-charge-adding-text">{t('desk.addingToOrder', { token: addingTo.tokenLabel })}</span>
      <button type="button" className="pos-charge-adding-stop" onClick={addingTo.onStop} disabled={addingBusy}>
        {t('desk.stopAdding')}
      </button>
    </div>
  ) : null;
  const addButton = addingTo ? (
    <button
      type="button"
      className="btn pos-charge-cta"
      disabled={addingBusy}
      aria-busy={addingBusy}
      onClick={() => void addToOrder()}
    >
      {addingBusy ? t('desk.addingBusy') : t('desk.addToOrder', { token: addingTo.tokenLabel, amount: money(totalMinor) })}
    </button>
  ) : null;

  const completePosSale = () => {
    if (addingTo) {
      void addToOrder();
      return;
    }
    if (saving !== null || lines.length === 0) return;
    const ok = readyToPay();
    if (fromApp) {
      if (ok) void pay('other');
      return;
    }
    if (!selectedMode) {
      setBadMode(true);
      return;
    }
    setBadMode(false);
    if (!ok) return;
    if (selectedMode === 'upi' && paymentQr && !firstWay) setStep('qr');
    else void pay(selectedMode);
  };

  const sendPosPending = () => {
    if (addingTo || saving !== null || lines.length === 0 || fromApp) return;
    setBadMode(false);
    if (!readyToPay()) return;
    void pay('cash', true);
  };

  useEffect(() => {
    if (inactive || !productsOnly || !wide || step !== 'what') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        setWhoOpen('find');
      } else if (e.key === 'F8') {
        e.preventDefault();
        completePosSale();
      } else if (e.key === 'F9') {
        e.preventDefault();
        // Nothing to hold while adding to a waiting order: Stop is how to leave it.
        if (addingTo) return;
        if (lines.length > 0) holdBill();
        else if (heldBills.length > 0) resumeHeldBill(heldBills[0]!.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const leave = () => {
    /*
     * QA 2026-10-28 — somewhere to go beats starting again.
     *
     * `productsOnly` was tested first, so on a shop's or a restaurant's till — which is products-only by
     * definition — Back always meant `nextCustomer()`: clear the lines and stay. On an empty till that
     * clears nothing and goes nowhere, so the owner tapped Back on "Take an order" and the screen sat
     * there. `backTo` is '/orders' on exactly that screen and was never reached.
     *
     * The order is the fix: if this till was opened FROM somewhere, Back returns there. `nextCustomer()`
     * is for the till that is nobody's second screen — `/products/sell` reached from the nav, where there
     * is no "there" to go back to and starting the next customer is the useful thing.
     */
    if (backTo) {
      router.push(backTo);
      return;
    }
    /*
     * Owner, 2026-11-03 — and only while there is a bill to clear.
     *
     * On a till reached from the nav or from Home there IS no `backTo`, so Back meant `nextCustomer()` whatever
     * the screen held. With nothing on the bill that clears nothing and goes nowhere: the arrow at the top of
     * the screen looked broken, which is what it was reported as. An arrow has to arrive somewhere.
     */
    if (productsOnly && lines.length > 0) {
      nextCustomer();
      return;
    }
    router.push('/');
  };
  // Assigned on every render: `leave` closes over state that moves (backTo, the lines), so a stale one would
  // clear a bill that is no longer on the screen. Cleared when the flow unmounts, for the same reason: the
  // owner of the ref outlives this component, and a Back arrow left pointing at a gone screen's `leave` is the
  // stale closure this effect exists to prevent.
  useEffect(() => {
    if (!leaveRef) return;
    leaveRef.current = leave;
    return () => {
      leaveRef.current = null;
    };
  });
  const payToken = token ? `&token=${encodeURIComponent(token.id)}${token.locationId ? `&location=${encodeURIComponent(token.locationId)}` : ''}` : '';
  const simpleForm = `/appointments/new?purpose=payment${payToken}`;
  const fullForm = `/appointments/new?purpose=payment&full=1${payToken}`;

  /* ---------- ③ Done ---------- */
  // The same screen the one-page form ends on (owner, 2026-10-10): `PaymentDone`, sound, Next customer and all.
  /** Owner, 2026-11-16 — Print KOT the moment the order is placed: under the "sent to queue" banner, phone and wide alike. */
  /** Jira GRW-716 — offline, or orders waiting to send: one amber line over the till; nothing when all is well. */
  const offlineBar = productsOnly ? <OfflineTillBar branch={location} branches={tillBranches} onReprint={(saleId) => void printer.reprintKots(saleId)} /> : null;
  const queuedPrint =
    queuedBanner?.saleId && queuedBanner.kot ? (
      <TillPrintActions
        printer={printer}
        saleId={queuedBanner.saleId}
        kot={queuedBanner.kot}
        order={{ tokenNo: queuedBanner.tokenNo, channel: queuedBanner.channel ?? 'counter' }}
      />
    ) : null;

  if (step === 'done' && sale) {
    return (
      <PaymentDone
        appointmentId={sale.appointmentId}
        fixHref={sale.productOnly ? null : fixVisitHref(sale.appointmentId, sale.day)}
        totalMinor={sale.totalMinor}
        mode={sale.mode}
        modeLabel={sale.paidBy}
        title={sale.title}
        summary={sale.summary}
        bill={sale.bill}
        phone={sale.phone}
        onNextCustomer={nextCustomer}
        onDone={leave}
        sound={sound}
        onToggleSound={toggleSound}
        printSlot={
          sale.productOnly ? (
            <TillPrintActions
              printer={printer}
              saleId={sale.appointmentId}
              kot={sale.kot}
              order={{ tokenNo: sale.tokenNo, offlineToken: sale.offlineToken, channel: sale.channel }}
              bill={sale.channel === 'counter'}
              receipt={sale.receipt}
            />
          ) : null
        }
      />
    );
  }

  /*
   * Jira GRW-648 — the points, where the money is decided.
   *
   * One switch and one figure, drawn only when this client has enough for this bill: no client, no scheme, or
   * too few points and there is nothing here at all, which is what the till looked like before. It sits with
   * the ways of paying rather than with the bill, because that is what it is — part of how this bill is being
   * settled, not a line of what was bought (the lines keep their own prices; the API takes the discount off
   * them, and the receipt says so).
   *
   * Tapping it spends the most this bill allows. There is no box to type a number into: the cap, the floor
   * and the balance already decide the answer, and a till is not the place to do arithmetic at somebody.
   */
  /*
   * Jira GRW-648 — one row, both tills (`RedeemRow`), so they cannot grow different words for the same
   * balance or a toggle on one screen and not the other.
   */
  const redeemRow = <RedeemRow rewards={rewards} usePoints={usePoints} onToggle={toggleRedeem} disabled={saving !== null} checking={pointsChecking} />;

  /*
   * Owner, 2026-11-15 — Discount on the whole bill, as a % or an amount, on every business's till. It sets the same
   * total "Change the total" does (that is what the API is sent); the % is named on the bill and the receipt while
   * the total is still exactly what that % gave.
   */
  const offPct = shownPercent(discountPct, listMinor, totalMinor);
  const billOffMinor = listMinor - totalMinor;
  /*
   * Owner, 2026-11-15 — "give discount option at the final payment screen only": where money is being taken. Not
   * while the payment ways are held back for a guest (only "Keep payment pending" can happen then — the discount is
   * given at the Queue's payment instead), and not for a delivery app's order, whose money the app collects.
   */
  const discountRow =
    lines.length > 0 && !addingTo && !fromApp ? (
      <button type="button" className={`pf-discount-open${billOffMinor > 0 ? ' is-on' : ''}`} onClick={() => setDiscountOpen(true)} disabled={saving !== null}>
        <span className="pf-discount-badge" aria-hidden="true">
          %
        </span>
        <span className="pf-discount-open-words">
          {billOffMinor > 0 ? (offPct !== null ? t('discount.onPct', { pct: offPct }) : t('discount.on')) : t('discount.add')}
        </span>
        {billOffMinor > 0 ? (
          <>
            <strong className="pf-discount-open-amount">−{money(billOffMinor)}</strong>
            <span className="pf-discount-open-change">{t('discount.change')}</span>
          </>
        ) : null}
      </button>
    ) : null;
  /*
   * Jira GRW-725 — beside the discount: on a ₹0 bill, the plain sentence for anyone but the owner, and the owner's
   * required Reason. Drawn wherever the bill is ₹0, not only where the Discount button is, because a typed total gets
   * there too.
   */
  /** Jira GRW-735 — the buy-get offers this bill takes, and the Coupon code, under the discount. */
  const offersRows = offersHere ? (
    <>
      <OfferLines bogo={billOffers.bogo} />
      {billOffers.taxOnTop && billOffers.taxMinor > 0 ? (
        <p className="pf-tax-line">
          <span>{t('offers.gst')}</span>
          <strong>{money(billOffers.taxMinor)}</strong>
        </p>
      ) : null}
      {fromApp ? null : (
        <CouponRow
          code={couponCode}
          coupon={couponLost ? { code: couponCode, name: couponLost, offMinor: 0 } : billOffers.coupon}
          refusal={couponOn ? billOffers.couponRefusal : null}
          kept={couponLost ? 'discount' : billOffers.kept}
          checking={couponOn && billOffers.checking}
          disabled={saving !== null}
          onApply={(code) => {
            setCouponLost(null);
            setCouponCode(code);
          }}
          onRemove={() => {
            setCouponCode(null);
            setCouponLost(null);
          }}
        />
      )}
    </>
  ) : null;
  const freeBillRow = freeBill ? <FreeBillReason block={freeBlock} reason={freeReason} onReason={setFreeReason} disabled={saving !== null} /> : null;
  const discountSheet = discountOpen ? (
    <DiscountSheet
      ownerOnlyFree={!isOwner}
      listMinor={listMinor}
      current={billOffMinor > 0 ? { pct: offPct, offMinor: billOffMinor } : null}
      onApply={(offMinor, pct) => {
        setOverride(offMinor > 0 ? listMinor - offMinor : null);
        setDiscountPct(pct);
        setDiscountOpen(false);
      }}
      onRemove={() => {
        setOverride(null);
        setDiscountPct(null);
        setDiscountOpen(false);
      }}
      onClose={() => setDiscountOpen(false)}
    />
  ) : null;

  /** The amount to collect, and — when points are coming off — the bill it was before they did. */
  const dueLine = (
    <p className="pf-how-total">
      <span className="pf-how-total-label">{discountMinor > 0 ? t('toPay') : t('total')}</span>
      <strong>{money(dueMinor)}</strong>
      {discountMinor > 0 ? (
        <span className="pf-how-total-off">{t('rewards.wasOff', { bill: money(totalMinor), amount: money(discountMinor) })}</span>
      ) : null}
    </p>
  );

  /* ---------- ②b Let them scan ---------- */
  /*
   * The owner's own QR, as big as the phone will draw it (owner, 2026-10-11).
   *
   * Three things and nothing else: what to pay, the code, and the one button that says the money arrived. The
   * amount is above the code because the customer types it into their own app — a static QR carries no amount —
   * and because an owner holding up a phone should not have to remember the figure.
   */
  if (step === 'qr' && paymentQr) {
    return (
      <div className="pf">
        <header className="pf-head">
          <button type="button" className="pf-back" aria-label={nv.back} onClick={() => setStep(wide ? 'what' : 'how')} disabled={saving !== null}>
            <IconArrowLeft />
          </button>
          <h1 className="pf-title">{t('qrTitle')}</h1>
          <span className="pf-head-gap" aria-hidden="true" />
        </header>
        {/* The figure the customer types into their own app, so it is what is left to pay, not the bill. */}
        {dueLine}
        {/* Owner, 2026-10-23 — a scan taken here is answered, not ignored. */}
        {scanNote ? (
          <div role="status" className="pf-error">
            {scanNote}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="pf-error">
            {error}
          </div>
        ) : null}
        <div className="pf-qr">
          {qrBroken ? (
            /* Not an error the owner caused, so it is said plainly, with the one screen that fixes it one tap away. */
            <div className="pf-qr-missing">
              <IconPayUpi />
              <p className="pf-qr-missing-title">{t('qrMissing')}</p>
              <Link className="btn btn-ghost" href="/settings/payments">
                {t('qrAddIt')}
              </Link>
            </div>
          ) : (
            <>
              {/* The salon's own picture, not a logo: `alt` says what it is for, since nothing else on screen does. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pf-qr-code" src={paymentQr} alt={t('qrAlt')} onError={() => setQrBroken(true)} />
            </>
          )}
        </div>
        {/* "They type the amount in their own app" is advice about a code that is on screen; with no code it is noise. */}
        {!qrBroken && <p className="pf-qr-hint">{t('qrHint')}</p>}
        <button type="button" className="btn pf-go pf-qr-paid" onClick={() => void pay('upi')} disabled={saving !== null || pointsChecking} aria-busy={saving === 'upi'}>
          {saving === 'upi' ? t('saving') : t('qrPaid')}
        </button>
        {/* The large-amount question is asked from here too: a typo'd total answered 409 and waited for a dialog nobody drew. */}
        {dialog}
      </div>
    );
  }

  /*
   * The four payment tiles. On a phone they are ② — a screen of their own; on the wide till they sit under the
   * bill. One element, so UPI's QR rule and the save are written once.
   */
  const restMinor = firstWay ? Math.max(0, dueMinor - firstWay.minor) : 0;
  // An app's order has nothing to collect: no tiles (its note is drawn in their place).
  // Jira GRW-721 — a table's order waits for its money until the guests leave: no way of paying is asked here.
  const payTiles = fromApp || atTable ? null : (
    <div className="pf-pay" data-step={guideMode ? 'next' : badMode && !selectedMode ? 'bad' : undefined} role="group" aria-label={t('howTitle')}>
      {firstWay ? (
        /* The first way, held, and what the next tile is for. × puts the bill back to one way. */
        <p className="pf-split-held" role="status">
          <span>{t(splitTooBig ? 'split.tooBig' : 'split.then', { amount: money(firstWay.minor), mode: modeWord(firstWay.mode), rest: money(restMinor) })}</span>
          <button type="button" className="icon-btn pf-split-clear" aria-label={t('split.clear')} onClick={clearSplit}>
            <IconClose />
          </button>
        </p>
      ) : splitting ? (
        <p className="pf-split-held" role="status">
          <span>{t('split.first')}</span>
          <button type="button" className="icon-btn pf-split-clear" aria-label={t('split.clear')} onClick={clearSplit}>
            <IconClose />
          </button>
        </p>
      ) : null}
      {(['cash', 'upi', 'card', 'other'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={`pf-pay-tile pf-pay-${mode}${productsOnly && wide && selectedMode === mode ? ' is-selected' : ''}`}
          aria-pressed={productsOnly && wide && !splitting ? selectedMode === mode : undefined}
          /*
           * UPI is the one tile that may not be the save.
           *
           * With a QR uploaded it opens the QR for the customer to scan, and the money is recorded on the
           * next screen when it has actually arrived — recording it here would mark a sale paid before
           * anybody had scanned anything. Every other tile still saves on the tap (the Square model): cash
           * is in the hand, and the done screen's Fix a mistake is the way back.
           */
          onClick={() => {
            if (productsOnly && wide && !splitting) {
              setSelectedMode((prev) => (prev === mode ? null : mode));
              setBadMode(false);
              return;
            }
            if (wide && !readyToPay()) return;
            // "Which way first?" — this tile is the first way; the keypad asks how much came that way.
            if (splitting && !firstWay) {
              setSplitKeypad(mode);
              setSplitAmount('');
              return;
            }
            // A bill paid two ways is recorded as the tap says: the QR screen is for the whole bill by UPI.
            if (mode === 'upi' && paymentQr && !firstWay) setStep('qr');
            else void pay(mode);
          }}
          // QA 2026-10-23 — the second way cannot be the first one again: the tile says so instead of a tap that does nothing.
          disabled={saving !== null || pointsChecking || splitTooBig || firstWay?.mode === mode || freeBlock !== null}
          aria-busy={saving === mode}
        >
          <span className="pf-pay-icon" aria-hidden="true">
            {PAY_ICONS[mode]}
          </span>
          <span className="pf-pay-word">{saving === mode ? t('saving') : mode === 'other' ? t('other') : modeWord(mode)}</span>
          {/* What it means, for the owner who is not sure which word is theirs. Never the only label. */}
          <span className="pf-pay-sub">{t(`sub.${mode}`)}</span>
        </button>
      ))}
      {!productsOnly && !splitting && !firstWay ? (
        <button type="button" className="pf-split-link" onClick={() => setSplitting(true)} disabled={saving !== null}>
          {t('split.link')}
        </button>
      ) : null}
    </div>
  );
  /** The keypad for how much came the first way; the rest is the next tile's. Enough for the whole bill is one way. */
  const splitKeypadEl =
    splitKeypad !== null ? (
      <Keypad
        title={t('split.howMuch', { mode: modeWord(splitKeypad) })}
        value={splitAmount}
        hint={t('split.restHint')}
        onChange={setSplitAmount}
        onDone={() => {
          const rupees = Number(splitAmount);
          const minor = Number.isFinite(rupees) && splitAmount !== '' ? Math.round(rupees * 100) : 0;
          const mode = splitKeypad;
          setSplitKeypad(null);
          setSplitAmount('');
          setSplitting(false);
          if (minor <= 0) return;
          if (minor >= dueMinor) {
            setFirstWay(null);
            void pay(mode);
            return;
          }
          setFirstWay({ mode, minor });
        }}
        onClose={() => {
          setSplitKeypad(null);
          setSplitAmount('');
        }}
      />
    ) : null;

  /* ---------- ② How did they pay? ---------- */
  if (step === 'how') {
    return (
      <div className="pf">
        <header className="pf-head">
          <button type="button" className="pf-back" aria-label={nv.back} onClick={() => setStep('what')} disabled={saving !== null}>
            <IconArrowLeft />
          </button>
          <h1 className="pf-title">{atTable ? atTable.label : t('howTitle')}</h1>
          <span className="pf-head-gap" aria-hidden="true" />
        </header>
        {dueLine}
        {discountRow}
        {freeBillRow}
        {offersRows}
        {redeemRow}
        {/* Owner, 2026-10-23 — a scan taken here is answered, not ignored. */}
        {scanNote ? (
          <div role="status" className="pf-error">
            {scanNote}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="pf-error">
            {error}
          </div>
        ) : null}
        {/*
          Four tiles, two across (owner, 2026-10-10).
          Three coloured slabs down the page put 546px of saturation behind three words, and because each
          icon-and-word pair was centred as a unit the three words each began at a different x — nothing on the
          screen had a left edge. "Paid another way" was a text link below them, which made the one option a
          hesitant owner reaches for the hardest thing on the screen to hit.
          A 2×2 grid of tinted cards fixes all of it: colour down to an icon on a pale ground, every label on the
          same line, and Other a target the size of the rest.
        */}
        {payTiles}
        {productsOnly && !fromApp && !splitting && !firstWay ? (
          <div className="pos-charge-actions pos-charge-actions-mobile">
            {onOpenQueue ? (
              <button
                type="button"
                className="btn pos-charge-pending"
                disabled={saving !== null || lines.length === 0 || freeBlock !== null}
                onClick={sendPosPending}
              >
                <span>{atTable ? tTables('sendToKitchen') : t(qk('desk.keepPendingInQueue'))}</span>
              </button>
            ) : null}
            <button type="button" className="pf-split-link" onClick={() => setSplitting(true)} disabled={saving !== null}>
              {t('split.link')}
            </button>
          </div>
        ) : null}
        {splitKeypadEl}
        {dialog}
        {/*
          Jira GRW-679 (UX-01) — the guest sheet, on this step too. It was only drawn on the step before, so the
          "Add guest" button above had nothing to open; choosing one here brings the payment tiles up in place.
        */}
        {whoOpen ? (
          <ClientSheet
            location={location}
            nameStaysOnBill={guestOptional}
            startAdding={whoOpen === 'add'}
            onPick={(c) => {
              setClient(c.id === null ? { kind: 'named', name: c.name ?? '', phone: c.waPhone } : { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone });
              setWhoOpen(false);
            }}
            onClose={() => setWhoOpen(false)}
          />
        ) : null}
        {discountSheet}
      </div>
    );
  }

  /*
   * Owner, 2026-10-24 — Order from: Counter, or one of the business's delivery apps. Shown only where the business
   * has an app (a restaurant). Chips, not a select: two or three choices, each one tap, the chosen one plainly on.
   */
  /** The app's own order number, once an app is chosen: under the chips on a plain till, in the bill on a till with tables. */
  const orderNo =
    fromApp && !token ? (
      <>
        <button type="button" className="pf-from-no" onClick={() => setOrderNoOpen(true)} disabled={saving !== null}>
          <span className="pf-from-no-label">{t('from.orderNo', { app: appWord(fromApp) })}</span>
          <span className="pf-from-optional">{appOrderNo.trim() ? appOrderNo.trim() : t('from.addOrderNo')}</span>
        </button>
        {orderNoOpen ? (
          <AppOrderNoSheet
            app={appWord(fromApp)}
            value={appOrderNo}
            onDone={(no) => {
              setAppOrderNo(no);
              setOrderNoOpen(false);
            }}
            onClose={() => setOrderNoOpen(false)}
          />
        ) : null}
      </>
    ) : null;
  // Jira GRW-720 — the same row twice: with "Counter" first as it always was, and apps-only under the Delivery tab.
  const appRow = (withCounter: boolean) =>
    apps.length > 0 && !token ? (
      <div className="pf-row pf-from" role="group" aria-label={t('from.label')}>
        <span className="pf-row-label">{t('from.label')}</span>
        <div className="pf-chips">
          {(withCounter ? ['counter', ...apps] : apps).map((key) => (
            <button
              key={key}
              type="button"
              className={`pf-chip${(fromApp ?? 'counter') === key ? ' pf-chip-on' : ''}`}
              aria-pressed={(fromApp ?? 'counter') === key}
              disabled={saving !== null}
              onClick={() => setOrderFrom(key)}
            >
              {key === 'counter' ? t('from.counter') : appWord(key)}
            </button>
          ))}
        </div>
        {withCounter ? orderNo : null}
      </div>
    ) : null;
  const fromRow = appRow(true);
  const fromAppChips = appRow(false);

  /*
   * Jira GRW-720 — Dine-in · Takeaway · Delivery, for a branch that seats its guests. A segmented control, each tab
   * 44px, the chosen one marked by more than its colour (aria-pressed and a filled tab). Delivery opens the app chips the
   * till already had, so picking Swiggy or Zomato is the same one tap it always was.
   */
  const typeTabs: Array<'dine_in' | 'takeaway' | 'delivery'> = ['dine_in', 'takeaway', ...(apps.length > 0 ? (['delivery'] as const) : [])];
  /*
   * Jira GRW-745 — the switch has ONE place: the top of the till, on the table map and over the dishes alike (it used to
   * jump into the bill panel). Once the order has a table or a dish it is locked, and says why: a tap must never turn a
   * table's order into a takeaway (BR-01).
   */
  const typeLock = atTable ? t('type.lockedTable', { table: atTable.label }) : lines.length > 0 ? t('type.locked') : null;

  /** The tab the switch marks: in the POS bar, Pickup is Takeaway's and Return is none of them. */
  const tabShown = typeInBar && typeBar ? barTabShown(typeBar.mode, orderTab) : orderTab;
  const pickupCount = typeInBar ? (typeBar?.pickupCount ?? null) : null;
  const typeTabsEl = (
    <div className="pf-type-tabs">
      {typeTabs.map((key) => (
        <button
          key={key}
          type="button"
          className={`pf-type-tab${tabShown === key ? ' is-on' : ''}${key === 'takeaway' && pickupCount !== null ? ' has-pickup' : ''}`}
          aria-pressed={tabShown === key}
          aria-describedby={typeLock ? 'pf-type-lock' : undefined}
          disabled={saving !== null}
          aria-disabled={typeLock !== null && orderTab !== key ? true : undefined}
          onClick={() => {
            // From Pickup or Return, any tab is the way back to the till; the bill and its type are as they were.
            if (typeInBar && typeBar && typeBar.mode !== 'sell') {
              typeBar.toSell();
              if (key === orderTab) return;
            }
            if (typeLock) {
              if (orderTab !== key) setTypeNudge(true);
              return;
            }
            setOrderTab(key);
            setOrderFrom(key === 'delivery' ? (fromApp ?? apps[0] ?? 'counter') : 'counter');
          }}
        >
          <span className="pf-type-tab-main">
            <TypeIcon type={key} />
            {t(`type.${key}`)}
            {/* Design review D1 — a locked choice says so with a padlock (on a laptop; a phone says why on a tap), not by fading. */}
            {typeLock !== null && orderTab !== key ? (
              <span className="pf-type-lockicon" aria-hidden="true">
                <IconLock />
              </span>
            ) : null}
          </span>
          {/* Owner, 2026-11-22 — Pickup's count rides on Takeaway, where those orders are ("keep the name as pickup"). */}
          {/* A laptop says "Pickup 4" beside the word; a phone has room only for the 4, as a badge on the tab's corner
              (owner, 2026-11-22 — "not looking good on mobile"). The words stay for a screen reader either way. */}
          {key === 'takeaway' && pickupCount !== null ? (
            <span className={`pf-type-pickup${pickupCount > 0 ? ' is-live' : ''}`}>
              <span className="pf-type-pickup-word">{t('type.pickupCount', { count: pickupCount })}</span>
              <span className="pf-type-pickup-n" aria-hidden="true">
                {pickupCount}
              </span>
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
  const typeLockEl = typeLock ? (
    <p className="pf-type-lock" id="pf-type-lock">
      <IconLock />
      {typeLock}
    </p>
  ) : null;
  const typeClass = `pf-type pf-type-top${typeLock ? ' is-locked' : ''}${typeNudge ? ' is-nudged' : ''}`;
  /* QA 2026-11-21 — the lock is the switch's alone (BR-01): the app row stays once a dish is in, so Swiggy and Zomato can
     still be swapped (both are deliveries, same prices) and nothing under it moves (AC-07). */
  const appsRow = orderTab === 'delivery' && apps.length > 0 ? fromAppChips : null;

  const typeRow =
    tablesHere && !token && !waiter && !addingTo ? (
      typeInBar && typeBar?.slot ? (
        <>
          {createPortal(
            <div className={`${typeClass} pf-type-inbar`} role="group" aria-label={t('type.label')}>
              {typeTabsEl}
              {typeLockEl}
            </div>,
            typeBar.slot,
          )}
          {appsRow ? <div className="pf-type pf-type-apps">{appsRow}</div> : null}
        </>
      ) : (
        <div className={typeClass} role="group" aria-label={t('type.label')}>
          {typeTabsEl}
          {typeLockEl}
          {appsRow}
        </div>
      )
    ) : null;
  /** Jira GRW-745 FR-03 — the bill names what it is for. A table's is the strip below; a takeaway or a delivery says so here. */
  /*
   * Owner, 2026-11-22 ("is this required?") — on a phone a new takeaway's card only repeated the Takeaway tab and New order
   * right above it. It stays where it says something: a delivery (its app and order number), an order being added to
   * ("Takeaway · #08"), and the laptop's bill panel, whose title it is.
   */
  const repeatsTheBar = typeInBar && !wide && !token && orderTab === 'takeaway';
  const orderHead =
    tablesHere && !atTable && !addingTo && !waiter && !repeatsTheBar ? (
      <div className={`pf-order-head is-${token ? 'takeaway' : orderTab}`}>
        <strong className="pf-order-head-title">
          <TypeIcon type={token ? 'takeaway' : orderTab} />
          {token
            ? token.tokenNo !== null
              ? t('type.headToken', { token: nv.token(token.tokenNo) })
              : t('type.takeaway')
            : orderTab === 'delivery'
              ? t('type.headDelivery', { app: fromApp ? appWord(fromApp) : t('type.delivery') })
              : t('type.headTakeaway')}
        </strong>
        {/* Design review D6 — a delivery's head said "Paid to you by the app" over a bill that says "Paid on Swiggy. Nothing to
            collect here.": once is enough, and the bill is where the money is. */}
        {orderTab === 'delivery' && !token ? null : (
          <span className="pf-order-head-sub">{token ? token.customerName : t('type.subTakeaway')}</span>
        )}
        {/* Owner, 2026-11-21 ("alignment issue") — the number belongs to this bill, so it sits here, not beside the switch. */}
        {orderTab === 'delivery' ? orderNo : null}
      </div>
    ) : null;

  /* ---------- ① What did they get? ---------- */
  // Jira GRW-723 — a waiter does not look up guests (that is the Clients page, which a waiter does not hold): the guest is named when they pay.
  const who = waiter ? null : token ? (
    <p className="pf-who-token">
      {token.tokenNo !== null ? `${nv.token(token.tokenNo)} · ` : ''}
      {token.customerName}
    </p>
  ) : (
    <div className="pf-row" role="group" aria-label={t('who', { client: clientNoun })}>
      <span className="pf-row-label">{t('who', { client: clientNoun })}</span>
      {client.kind !== 'none' ? (
        /* Who it is, and the way to change it. A client on file shows their number; a name typed just now has none. */
        <div className="pf-who-picked">
          <span className="pf-face" aria-hidden="true">
            {(client.kind === 'existing' ? (client.name ?? '') : client.name).trim().charAt(0).toUpperCase() || '?'}
          </span>
          <span className="pf-who-picked-name">{client.kind === 'existing' ? (client.name ?? nv.noName) : client.name}</span>
          {client.kind === 'existing' && client.phone ? <span className="pf-who-picked-sub">{displayPhone(client.phone)}</span> : null}
          <button type="button" className="pf-who-clear" aria-label={nv.close} onClick={() => setClient({ kind: 'none' })}>
            <IconClose />
          </button>
        </div>
      ) : (
        /*
         * A bar that looks like search and a plus beside it (owner, 2026-10-09). The row held one small chip and
         * most of the width was empty; a bar says "type a name here" without a word of instruction, and the plus
         * is the one thing it cannot say — adding somebody who is not in the list yet. Both open the same sheet.
         */
        <div className={`pf-who-bar ${badClient ? 'pf-bad' : ''}`} data-step={guideClient ? 'next' : undefined} ref={whoChips}>
          <button type="button" className="pf-who-search" onClick={() => setWhoOpen('find')}>
            <IconSearch />
            <span className="pf-who-search-text">{t('nameOrNumber')}</span>
          </button>
          <button type="button" className="pf-who-add" aria-label={t('addClient', { client: nounInSentence(clientNoun) })} onClick={() => setWhoOpen('add')}>
            <IconPlus />
          </button>
        </div>
      )}
      {badClient ? (
        <p className="pf-miss" role="alert">
          {t('needClient')}
        </p>
      ) : null}
    </div>
  );

  const stylists =
    shownProviders.length > 0 ? (
      <div className="pf-row" role="group" aria-label={providerNoun}>
        <span className="pf-row-label">{providerNoun}</span>
        <div className="pf-chips">
          {shownProviders.map((p) => {
            const on = stylistId === p.id;
            return (
              <button key={p.id} type="button" aria-pressed={on} className={`pf-chip ${on ? 'pf-chip-on' : ''}`} onClick={() => pickStylist(on ? null : p.id)}>
                {p.photoUrl ? (
                  <img className="pf-face" src={p.photoUrl} alt="" onError={(e) => (e.currentTarget.hidden = true)} />
                ) : (
                  <span className="pf-face" aria-hidden="true">
                    {p.displayName.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                {p.displayName}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  /*
   * Jira GRW-721 — Dine-in at a branch that seats guests opens on the room, not the dish grid: tap a free table to order
   * for it, a busy one to open its bill. The tabs stay above, so Takeaway and Delivery are one tap away.
   */
  const role = session?.role ?? 'owner';
  const seatHere = async () => {
    if (!atTable) return;
    setSeating(true);
    try {
      await api.seatTable(atTable.id, guests);
      setTableSent(tTables('seatedOk', { table: atTable.label }));
    } catch (e) {
      // AC-02 — "T3 was just taken": the room is read again and shows who has it.
      setTableSent(e instanceof ApiError ? e.message : tTables('actionFailed'));
    } finally {
      setSeating(false);
      setAtTable(null);
      setGuests(null);
      setMapKey((k) => k + 1);
    }
  };
  /*
   * Owner, 2026-11-22 ("this UI is not good") — with the switch in the POS bar the strip is two rows at 344px, not three:
   * the table itself is the way back ("← T1 · Main Hall"), the Dine-in chip goes (the bar's Dine-in already says it), the
   * head count is People (not "Guests" right above the Guest who pays), and seating without an order is the quiet choice,
   * not a second green button beside Next. A waiter's till and full screen keep the chip and "← Tables" (no bar above).
   */
  const tableStrip = atTable ? (
    <div className={`pf-table-strip${typeInBar ? ' is-in-bar' : ''}`}>
      {typeInBar ? (
        <button type="button" className="btn btn-ghost pf-table-back" aria-label={`${tTables('backToTables')}: ${atTable.label}`} onClick={() => setAtTable(null)}>
          <IconArrowLeft />
          <span className="pf-table-label">{atTable.label}</span>
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-ghost" onClick={() => setAtTable(null)}>
            ← {tTables('backToTables')}
          </button>
          {/* Always said: this bill is for a table, so it is Dine-in. */}
          <strong className="pf-table-name">
            <span className="pf-table-type">{t('type.dine_in')}</span>
            <span className="pf-table-label">{atTable.label}</span>
          </strong>
        </>
      )}
      {/* Jira GRW-734 — this area charges its own prices: said once, so a price on a tile is not a surprise. */}
      {hasAreaPrices(atTable.pricing) ? <span className="pf-table-prices field-hint">{tTables('areaPrices')}</span> : null}
      <div className="pf-guests" role="group" aria-label={tTables('peopleSkip')}>
        <span className="field-hint">{tTables('people')}</span>
        <button type="button" className="btn btn-ghost pf-guests-btn" aria-label={tTables('fewerGuests')} disabled={!guests} onClick={() => setGuests((g) => (g && g > 1 ? g - 1 : null))}>
          −
        </button>
        <span className="pf-guests-n" aria-live="polite">{guests ?? 0}</span>
        <button type="button" className="btn btn-ghost pf-guests-btn" aria-label={tTables('moreGuests')} onClick={() => setGuests((g) => Math.min(99, (g ?? 0) + 1))}>
          +
        </button>
      </div>
      {/*
        Jira GRW-732 — a Free table, nothing on the order yet: mark it Seated with the count above and go back to the room.
        The first order later turns it into Food cooking. Somebody seating it on another device a moment earlier: told so.
      */}
      {!atTable.billId && !atTable.seated && lines.length === 0 ? (
        <button type="button" className="btn pf-seat-btn" disabled={seating} onClick={() => void seatHere()}>
          {tTables('seatOnly')}
        </button>
      ) : null}
    </div>
  ) : null;
  // Jira GRW-723 AC-04 — a waiter at a branch that does not seat its guests is told so, and offered nothing else.
  if (waiter && session && !tablesHere) {
    return (
      <div className="pf-tables">
        <div className="tm-empty" role="status">
          <p className="tm-empty-title">{tTables('waiterOff')}</p>
          <p className="field-hint">{tTables('waiterOffHint')}</p>
        </div>
      </div>
    );
  }
  // Owner, 17 Nov 2026 — Add items on a queued order goes straight to the dishes: that order already has its place.
  if (tablesHere && orderTab === 'dine_in' && !atTable && !addingTo && !token && step === 'what' && location) {
    return (
      <div className="pf-tables">
        {typeRow}
        {tableSent ? (
          <p className="pf-table-sent" role="status">
            {tableSent}
          </p>
        ) : null}
        {/* Jira GRW-733 AC-02 — a station's slip that did not print is said over the room, with Print again for it alone. */}
        <PrintStatusLine printer={printer} />
        <TableMap
          location={location}
          canSetUp={role === 'owner' || role === 'manager'}
          refreshKey={mapKey}
          onFree={(table, area) => {
            setTableSent(null);
            setAtTable({ id: table.id, label: `${table.name} · ${area.name}`, ...(area.pricing ? { pricing: area.pricing } : {}) });
          }}
          onBusy={(table, area) => {
            setTableSent(null);
            setBillOf({ table, area: area.name, ...(area.pricing ? { pricing: area.pricing } : {}) });
          }}
        />
        {billOf ? (
          <TableBillSheet
            table={billOf.table}
            areaName={billOf.area}
            location={location}
            canManage={role === 'owner' || role === 'manager'}
            printer={printer}
            onAddDishes={() => {
              const seatedHere = !billOf.table.openBill && billOf.table.seated ? billOf.table.seated : null;
              setAtTable({
                id: billOf.table.id,
                label: `${billOf.table.name} · ${billOf.area}`,
                ...(billOf.pricing ? { pricing: billOf.pricing } : {}),
                ...(billOf.table.openBill ? { billId: billOf.table.openBill.saleId } : {}),
                // Jira GRW-732 — a Seated table's first order: the count it was seated with is the one the order starts from.
                ...(seatedHere ? { seated: true } : {}),
              });
              // QA 2026-11-21 — a table with a bill already open shows that bill's count (it read "–"); a change is sent with the round.
              setGuests(billOf.table.openBill?.guests ?? seatedHere?.guests ?? null);
              setBillOf(null);
            }}
            onTakePayment={
              onPayTable && billOf.table.openBill
                ? () => {
                    onPayTable({ saleId: billOf.table.openBill!.saleId, tableName: billOf.table.name });
                    setBillOf(null);
                  }
                : undefined
            }
            onDone={(said) => {
              setBillOf(null);
              setMapKey((k) => k + 1);
              if (said) setTableSent(said);
            }}
          />
        ) : null}
      </div>
    );
  }

  /* ---------- ① on a wide desk (Jira GRW-572): who · what · the bill, side by side ---------- */
  if (wide) {
    return (
      <div className="pf pf-wide">
        {hideHead ? null : (
          <header className="pf-head">
            <button type="button" className="pf-back" aria-label={nv.back} onClick={leave}>
              <IconArrowLeft />
            </button>
            <span className="pf-head-stack">
              <h1 className="pf-title">{productsOnly ? (heading ?? t('sellTitle', { product: nouns.product })) : t('whatTitle')}</h1>
              {token ? (
                branchName ? <span className="pf-at">{t('at', { branch: branchName })}</span> : null
              ) : (
                <HeaderBranchPicker variant="line" />
              )}
            </span>
            {/*
              Owner, 2026-10-14 — no Simple / Full switch on the wide till. The one-page form earned its door on
              the phone for the sale the three taps could not write: a package, a client added by name and number.
              The Desk sells packages and adds clients, so the switch here was a way to a smaller screen that does
              less. `?full=1` still opens the one-page form for anyone who types it.
            */}
            <span className="pf-head-gap" aria-hidden="true" />
          </header>
        )}
        {scanNote ? <div role="status" className="pf-error">{scanNote}</div> : null}
        {addingBanner}
        {queuedBanner ? (
          <div className="pos-charge-queued" role="status">
            <span className="pos-charge-queued-check" aria-hidden="true">
              <IconCheck />
            </span>
            <span className="pos-charge-queued-text">
              {queuedBanner.tokenNo !== null
                ? t(qk('desk.sentToQueueBannerWithToken'), {
                    token: nv.token(queuedBanner.tokenNo),
                    amount: money(queuedBanner.amountMinor),
                  })
                : t(qk('desk.pendingDoneTitle'), { amount: money(queuedBanner.amountMinor) })}
            </span>
            <button
              type="button"
              className="pos-charge-queued-link"
              onClick={() => {
                setQueuedBanner(null);
                if (onOpenQueue) onOpenQueue();
                else router.push('/pos?mode=queue');
              }}
            >
              {t(qk('desk.viewInQueue'))}
            </button>
            <button
              type="button"
              className="pos-charge-queued-close"
              aria-label={nv.close}
              onClick={() => setQueuedBanner(null)}
            >
              <IconClose />
            </button>
          </div>
        ) : null}
        {offlineBar}
        {queuedPrint}
        {tokenGone ? (
          <div role="alert" className="pf-error">
            {nv.tokenGone}
          </div>
        ) : null}
        {visitGone ? (
          <div role="alert" className="pf-error">
            {nv.visitGone}
          </div>
        ) : null}
        {typeRow}
        <div className="pf-wide-grid">
          <aside className="pf-wide-left">
            {who}
            {productsOnly ? (
              <DeskProductCategories
                picked={productCategory}
                categories={sellableCategories}
                allCount={products.length}
                noneCount={noneCount}
                onPick={setProductCategory}
              />
            ) : (
              <>
                {stylists}
                <DeskUnpaid location={location} timezone={timezone} currentTokenId={token?.id ?? null} currentVisitId={visit?.appointment.id ?? null} />
              </>
            )}
          </aside>
          {(productsOnly ? !productsLoaded : services === null) ? (
            <section className="pf-wide-mid" aria-busy="true">
              <div className="pf-tiles pf-wide-tiles">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="pf-tile pf-tile-wait" />
                ))}
              </div>
            </section>
          ) : !productsOnly && services!.length === 0 && initialTab !== 'products' ? (
            <section className="pf-wide-mid">
              <div className="empty">{nv.noServicesYet}</div>
            </section>
          ) : (
            <DeskServiceGrid
              services={ranked_all}
              countOf={countOf}
              onMore={addOne}
              onLess={oneLess}
              full={full}
              money={money}
              packages={offers.filter((o) => o.serviceIds.every((id) => (services ?? []).some((s) => s.id === id)))}
              packageCountOf={packageCountOf}
              onLessPackage={oneLessPackage}
              onPickPackage={pickPackage}
              products={products}
              productCountOf={productCountOf}
              onMoreProduct={addProduct}
              onLessProduct={(id) => oneLess(`p:${id}`)}
              initialTab={initialTab}
              productsOnly={productsOnly}
              productCategory={productCategory}
              searchSeed={searchSeed}
              categoryBar={
                productsOnly ? (
                  <DeskProductCategories
                    picked={productCategory}
                    categories={sellableCategories}
                    allCount={products.length}
                    noneCount={noneCount}
                    onPick={setProductCategory}
                  />
                ) : null
              }
            />
          )}
          <aside className="pf-wide-right">
            {/* Adding to a waiting order: it already has its guest and where it came from. */}
            {productsOnly && !addingTo ? (
              <div className="pos-bill-client">
                {tablesHere ? (atTable ? tableStrip : orderHead) : fromRow}
                {who}
              </div>
            ) : null}
            {productsOnly && !addingTo && heldBills.length > 0 ? (
              <div className="pos-held-strip" role="status">
                <span className="pos-held-label">{t('desk.heldBills', { count: heldBills.length })}</span>
                <div className="pos-held-actions">
                  <button type="button" className="pos-bill-action pos-bill-resume" onClick={() => resumeHeldBill(heldBills[0]!.id)}>
                    {t('desk.resumeBill')} <kbd>F9</kbd>
                  </button>
                  <button type="button" className="pos-bill-action pos-bill-discard" onClick={() => discardHeldBill(heldBills[0]!.id)}>
                    {t('desk.discardHeld')}
                  </button>
                </div>
              </div>
            ) : null}
            {/* Owner, 2026-10-14 — the lines scroll inside the panel on a long bill, so a link opens the whole bill as a card. */}
            <div className="pf-wide-bill-head">
              <h2 className="pf-wide-h">{t('billTitle')}</h2>
              {lines.length > 0 ? (
                <div className="pos-bill-head-actions">
                  {productsOnly ? (
                    <>
                      {addingTo ? null : (
                        <button type="button" className="pos-bill-action pos-bill-hold" onClick={holdBill}>
                          {t('desk.holdBill')} <kbd>F9</kbd>
                        </button>
                      )}
                      <button type="button" className="pos-bill-action pos-bill-clear" onClick={clearBill}>
                        {t('desk.clearBill')}
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="pf-wide-link" onClick={() => setBillOpen(true)}>
                    {t('onBill', { count: lines.length })} · {t('viewDetails')}
                  </button>
                </div>
              ) : null}
            </div>
            {productsOnly ? (
              badService ? (
                <p className="pf-miss pf-miss-wide" role="alert">
                  {t('pickProduct')}
                </p>
              ) : null
            ) : badService ? (
              <p className="pf-miss pf-miss-wide" role="alert">
                {lines.length > 0 ? t('needService') : t('pickOne')}
              </p>
            ) : null}
            {lines.length === 0 ? (
              <p className="pf-wide-empty">{productsOnly ? t('desk.emptyProductBill', { product: nouns.product }) : t('desk.emptyBill')}</p>
            ) : productsOnly ? (
              <PosBillRows
                offLabel={offPct !== null ? t('discount.billOffPct', { pct: offPct }) : undefined}
                lines={lines}
                products={products}
                listMinor={listMinor}
                totalMinor={totalMinor}
                full={full}
                onLess={oneLess}
                onMore={addProduct}
                onClearLine={clearLine}
                onEditPrice={openRowKeypad}
              />
            ) : (
              <BillRows
                lines={lines}
                listMinor={listMinor}
                totalMinor={totalMinor}
                onLess={oneLess}
                onPrice={openRowKeypad}
                offLabel={offPct !== null ? t('discount.billOffPct', { pct: offPct }) : undefined}
              />
            )}
            <button
              type="button"
              className="pf-wide-total"
              aria-label={t('changeTotal')}
              onClick={() => setKeypad(rupeesText(totalMinor))}
              disabled={lines.length === 0}
            >
              <span className="pf-wide-total-words">
                {t('total')}
                {/* Owner, 2026-10-14 — a figure alone looked like plain text; the pencil and the word say it can be typed over. */}
                <span className="pf-wide-total-edit">
                  <IconEdit />
                  {t('changeTotal')}
                </span>
              </span>
              <strong className="pf-total-figure">{money(totalMinor)}</strong>
            </button>
            {discountRow}
            {freeBillRow}
            {offersRows}
            {full ? (
              <div role="alert" className="pf-error">
                {nv.billFull(MAX_LINES)}
              </div>
            ) : null}
            {error ? (
              <div role="alert" className="pf-error">
                {error}
              </div>
            ) : null}
            {addingTo ? (
              addButton
            ) : (
              <>
            {/* Jira GRW-648 — between what the bill comes to and how it is being paid, which is what it is. */}
            {redeemRow}
            {discountMinor > 0 ? (
              <p className="pf-wide-due">
                {/* "To pay", not a second "Total": the bill's total is the button above it (salon QA 2026-11-07). */}
                <span>{t('toPay')}</span>
                <strong>{money(dueMinor)}</strong>
              </p>
            ) : null}
            {fromApp ? null : <h2 className="pf-wide-h">{atTable ? atTable.label : t('howTitle')}</h2>}
            {badMode && !selectedMode ? (
              <p className="pf-miss" role="alert">
                {t('desk.needPaymentMode')}
              </p>
            ) : null}
            {fromApp ? (
              <p className="pf-from-paid" role="status">
                {t('from.nothingToCollect', { app: appWord(fromApp) })}
              </p>
            ) : null}
            {payTiles}
            {productsOnly ? (
              <div className="pos-charge-actions">
                <button
                  type="button"
                  className="btn pos-charge-cta"
                  data-step={guideReady ? 'ready' : lines.length > 0 ? 'waiting' : undefined}
                  disabled={saving !== null || lines.length === 0 || freeBlock !== null}
                  onClick={completePosSale}
                >
                  <span>{fromApp ? t('from.complete', { amount: money(dueMinor) }) : t('desk.chargeNow', { amount: money(dueMinor) })}</span>
                  <kbd className="pos-charge-kbd">F8</kbd>
                </button>
                {!fromApp && !splitting && !firstWay ? (
                  <>
                    {onOpenQueue ? (
                      <button
                        type="button"
                        className="btn pos-charge-pending"
                        // QA 2026-11-17 — off, like Cash, until a ₹0 bill has its owner and reason: the tap did nothing and said nothing.
                        disabled={saving !== null || lines.length === 0 || freeBlock !== null}
                        onClick={sendPosPending}
                      >
                        <span>{atTable ? tTables('sendToKitchen') : t(qk('desk.keepPendingInQueue'))}</span>
                      </button>
                    ) : null}
                    <button type="button" className="pf-split-link" onClick={() => setSplitting(true)} disabled={saving !== null}>
                      {t('split.link')}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
              </>
            )}
            {splitKeypadEl}
            {dialog}
          </aside>
        </div>
        {choosing !== null && products.some((p) => p.id === choosing) ? (
          <ChoiceSheet
            product={products.find((p) => p.id === choosing)!}
            groups={groupsOf(choosing)}
            onAdd={(choice, qty) => addChoice(products.find((p) => p.id === choosing)!, choice, qty)}
            onClose={() => setChoosing(null)}
          />
        ) : null}
        {sizing !== null && products.some((p) => p.id === sizing) ? (
          <SizeSheet
            counted={counted}
            product={products.find((p) => p.id === sizing)!}
            onBill={(variantId) => productCountOf(sizing, variantId)}
            full={full}
            onAdd={(size) => addProduct(products.find((p) => p.id === sizing)!, size)}
            onLess={(size) => oneLess(productLineKey(sizing, size.id))}
            onClose={() => setSizing(null)}
          />
        ) : null}
        {whoOpen ? (
          <ClientSheet
            location={location}
            nameStaysOnBill={guestOptional}
            startAdding={whoOpen === 'add'}
            onPick={(c) => {
              setClient(c.id === null ? { kind: 'named', name: c.name ?? '', phone: c.waPhone } : { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone });
              setWhoOpen(false);
            }}
            onClose={() => setWhoOpen(false)}
          />
        ) : null}
        {discountSheet}
        {billOpen && lines.length > 0 ? (
          <BillCard
            offLabel={offPct !== null ? t('discount.billOffPct', { pct: offPct }) : undefined}
            lines={lines}
            listMinor={listMinor}
            totalMinor={totalMinor}
            onLess={(key) => {
              oneLess(key);
              if (lines.length === 1) setBillOpen(false);
            }}
            onPrice={openRowKeypad}
            onClose={() => setBillOpen(false)}
          />
        ) : null}
        {keypad !== null ? (
          <Keypad
            title={keypadFor ? t('desk.priceFor', { name: keypadFor.name }) : t('keypadTitle')}
            value={keypad}
            hint={t('listPrice', { amount: money(keypadFor ? keypadFor.list : listMinor) })}
            onChange={setKeypad}
            onDone={() => {
              const rupees = Number(keypad);
              const ok = Number.isFinite(rupees) && keypad !== '';
              if (keypadFor) {
                if (ok) setRowPrice(keypadFor.key, Math.round(rupees * 100));
              } else setOverride(ok && Math.round(rupees * 100) !== listMinor ? Math.round(rupees * 100) : null);
              setKeypad(null);
              setKeypadFor(null);
            }}
            onClose={() => {
              setKeypad(null);
              setKeypadFor(null);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="pf">
      {/*
        One header line, not three. The branch sits under the title as its second line — where you are, then
        which counter you are at — so the whole of the screen's chrome costs ~50px instead of the 100px that
        a title row, a branch row and the gap between them used to.

        The step dots went with that row. They marked 1 of 3 on a flow whose every screen already says what
        it is ("Record payment", "How did they pay?", "₹600 received") and whose button says what comes next,
        so they were the one thing on the line that no owner needed.
      */}
      {productsOnly ? (
        <>
          {hideHead ? null : (
            <header className="pf-head">
              <button type="button" className="pf-back" aria-label={nv.back} onClick={leave}>
                <IconArrowLeft />
              </button>
              <span className="pf-head-stack">
                <h1 className="pf-title">{heading ?? t('sellTitle', { product: nouns.product })}</h1>
                <HeaderBranchPicker variant="line" />
              </span>
              <span className="pf-head-gap" aria-hidden="true" />
            </header>
          )}
          {scanNote ? <div role="status" className="pf-error">{scanNote}</div> : null}
          {addingBanner}
          {queuedBanner ? (
            <div className="pos-charge-queued" role="status">
              <span className="pos-charge-queued-check" aria-hidden="true">
                <IconCheck />
              </span>
              <span className="pos-charge-queued-text">
                {queuedBanner.tokenNo !== null
                  ? t(qk('desk.sentToQueueBannerWithToken'), {
                      token: nv.token(queuedBanner.tokenNo),
                      amount: money(queuedBanner.amountMinor),
                    })
                  : t(qk('desk.pendingDoneTitle'), { amount: money(queuedBanner.amountMinor) })}
              </span>
              <button
                type="button"
                className="pos-charge-queued-link"
                onClick={() => {
                  setQueuedBanner(null);
                  if (onOpenQueue) onOpenQueue();
                  else router.push('/pos?mode=queue');
                }}
              >
                {t(qk('desk.viewInQueue'))}
              </button>
              <button
                type="button"
                className="pos-charge-queued-close"
                aria-label={nv.close}
                onClick={() => setQueuedBanner(null)}
              >
                <IconClose />
              </button>
            </div>
          ) : null}
          {offlineBar}
          {queuedPrint}
        </>
      ) : (
        <header className="pf-head">
          <button type="button" className="pf-back" aria-label={nv.back} onClick={leave}>
            <IconArrowLeft />
          </button>
          <span className="pf-head-stack">
            <h1 className="pf-title">{t('whatTitle')}</h1>
            {token ? (
              branchName ? <span className="pf-at">{t('at', { branch: branchName })}</span> : null
            ) : (
              <HeaderBranchPicker variant="line" />
            )}
          </span>
          {/* The ☰ that used to live here was the way to the full form: an icon that looked like a menu, did
              something else, and had no way back. The labelled switch takes its corner. */}
          <FormModeSwitch now="simple" simpleHref={simpleForm} advancedHref={fullForm} />
        </header>
      )}
      {tokenGone ? (
        <div role="alert" className="pf-error">
          {nv.tokenGone}
        </div>
      ) : null}
      {/*
        The booking named in the address is not settleable — paid on another phone, moved, cancelled. Said
        here for the same reason a stale token is (Jira GRW-403): the screen that follows looks like an
        ordinary sale, and the money would go in a second time against nothing.
      */}
      {visitGone ? (
        <div role="alert" className="pf-error">
          {nv.visitGone}
        </div>
      ) : null}
      {addingTo ? null : tablesHere ? (
        <>
          {typeRow}
          {atTable ? tableStrip : orderHead}
        </>
      ) : (
        fromRow
      )}
      {addingTo ? null : who}
      {productsOnly ? null : stylists}

      {/*
        The whole menu, under the two rows that name people and above the tiles it searches (owner, 2026-10-10).
        It was a "More…" tile at the END of the grid — eight photos away from the eye, and only reachable by
        scrolling past everything it exists to shortcut. A bar reads as "type what you are looking for"; the
        tiles below it stay the fast path for what is sold all day.
      */}
      {productsOnly && products.length > 0 ? (
        <>
          <div className="pf-row" role="group" aria-label={t(counted ? 'desk.products' : 'desk.menu')}>
            <span className="pf-row-label">{t(counted ? 'desk.products' : 'desk.menu')}</span>
            <div className="pf-who-bar">
              <button type="button" className="pf-who-search pf-find-service" onClick={() => setMenuOpen(true)}>
                <IconSearch />
                <span className="pf-who-search-text">{t(counted ? 'desk.searchProducts' : 'desk.searchDishes', { count: products.length })}</span>
              </button>
              <span className="pf-who-add pf-who-gap" aria-hidden="true" />
            </div>
          </div>
          {sellableCategories.length > 0 ? (
            <div className="pf-chips">
              <button
                type="button"
                className={`pf-chip ${productCategory === ALL_CATEGORIES ? 'pf-chip-on' : ''}`}
                aria-pressed={productCategory === ALL_CATEGORIES}
                onClick={() => setProductCategory(ALL_CATEGORIES)}
              >
                {t(counted ? 'allCategories' : 'allDishes')}
              </button>
              {sellableCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`pf-chip ${productCategory === c.id ? 'pf-chip-on' : ''}`}
                  aria-pressed={productCategory === c.id}
                  onClick={() => setProductCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
              {noneCount > 0 ? (
                <button
                  type="button"
                  className={`pf-chip ${productCategory === NO_CATEGORY ? 'pf-chip-on' : ''}`}
                  aria-pressed={productCategory === NO_CATEGORY}
                  onClick={() => setProductCategory(NO_CATEGORY)}
                >
                  {t('noCategory')}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {/* Owner, 2026-10-19 — Sell product sells from the shelf: no Services row, which only searched the same products again. */}
      {!productsOnly && services && (services.length > TILES || products.length > 0 || offers.length > 0) ? (
        /*
          A labelled row like Who? and Stylist above it, so the screen reads as three questions down one column
          rather than two questions and a loose bar. The empty span holds the width the + takes on the Who? row,
          which is what makes the two search bars the same box and not two boxes of different lengths.
        */
        <div className="pf-row" role="group" aria-label={t('services')}>
          <span className="pf-row-label">{t('services')}</span>
          <div className="pf-who-bar">
            <button type="button" className="pf-who-search pf-find-service" onClick={() => setMenuOpen(true)}>
              <IconSearch />
              <span className="pf-who-search-text">{t('searchCount')}</span>
            </button>
            <span className="pf-who-add pf-who-gap" aria-hidden="true" />
          </div>
        </div>
      ) : null}

      {productsOnly ? (
        badService ? (
          <p className="pf-miss pf-miss-wide" role="alert">
            {t('pickProduct')}
          </p>
        ) : null
      ) : (
        <>
          {badService ? (
            <p className="pf-miss pf-miss-wide" role="alert">
              {lines.length > 0 ? t('needService') : t('pickOne')}
            </p>
          ) : null}
        </>
      )}
      {productsOnly ? (
        !productsLoaded ? (
          <div className="pf-tiles" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="pf-tile pf-tile-wait" />
            ))}
          </div>
        ) : phoneProducts.length === 0 ? (
          <div className="empty">
            {products.length === 0 ? t(counted ? 'desk.noProducts' : 'desk.noDishes') : t(counted ? 'desk.noProductMatch' : 'desk.noDishMatch')}
          </div>
        ) : (
          <div className="pf-tiles">
            {phoneProducts.map((p) => {
              const count = productCountOf(p.id);
              const price = Number(p.priceMinor ?? 0);
              return (
                <div key={p.id} className={`pf-tile ${count > 0 ? 'pf-tile-on' : ''}`}>
                  <button
                    type="button"
                    className="pf-tile-tap"
                    aria-label={t('tileA11y', { name: p.name, price: money(price) })}
                    aria-pressed={count > 0}
                    onClick={() => addProduct(p)}
                    disabled={full && count === 0}
                  >
                    <ProductPhoto className="pf-tile-photo" product={p} />
                    <span className="pf-tile-name" title={p.name}>{p.name}</span>
                    <span className="pf-tile-price">
                      {money(price)}
                      {/* How many are left is a count; a kitchen's tile is the dish and its price, and nothing else. */}
                      {counted ? <span className={`pf-tile-mins ${p.stock <= 0 ? 'pf-tile-out' : ''}`}>{p.stock <= 0 ? t('outOfStock') : t('left', { n: p.stock })}</span> : null}
                    </span>
                  </button>
                  {count > 0 && hasSizes(p) ? (
                    // Jira GRW-599 — which size to take off is chosen in the size sheet; the tile only says how many are on the bill.
                    <span className="pf-tile-qty" role="group" aria-label={t('onBill', { count })}>
                      <span className="pf-qty-n">{count}</span>
                    </span>
                  ) : count > 0 ? (
                    <span className="pf-tile-qty" role="group" aria-label={t('onBill', { count })}>
                      <button type="button" className="pf-qty-btn" aria-label={t('oneLess', { name: p.name })} onClick={() => oneLess(`p:${p.id}`)}>
                        <IconMinus />
                      </button>
                      <span className="pf-qty-n" aria-live="polite">
                        {count}
                      </span>
                      <button type="button" className="pf-qty-btn" aria-label={t('oneMore', { name: p.name })} onClick={() => addProduct(p)} aria-disabled={full || undefined}>
                        <IconPlus />
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : services === null ? (
        <div className="pf-tiles" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="pf-tile pf-tile-wait" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="empty">{nv.noServicesYet}</div>
      ) : (
        <div className="pf-tiles">
          {tiles!.map((s) => {
            const count = countOf(s.id);
            return (
              <div key={s.id} className={`pf-tile ${count > 0 ? 'pf-tile-on' : ''}`}>
                <button
                  type="button"
                  className="pf-tile-tap"
                  aria-label={t('tileA11y', { name: s.name, price: money(Number(s.priceMinor ?? 0)) })}
                  aria-pressed={count > 0}
                  onClick={() => addOne(s)}
                  disabled={full && count === 0}
                >
                  <ServicePhoto className="pf-tile-photo" service={s} />
                  <span className="pf-tile-name" title={s.name}>{s.name}</span>
                  <span className="pf-tile-price">{money(Number(s.priceMinor ?? 0))}</span>
                </button>
                {count > 0 ? (
                  /*
                    Owner, 2026-10-10 — a − with no + taught nothing: the only way to a second haircut was to
                    tap the photo again and hope. − 2 + says outright that the number can go either way, the
                    same three-part control the full form uses (GRW-… "qty on bill"), at 44px a side.
                  */
                  <span className="pf-tile-qty" role="group" aria-label={t('onBill', { count })}>
                    <button type="button" className="pf-qty-btn" aria-label={t('oneLess', { name: s.name })} onClick={() => oneLess(s.id)}>
                      <IconMinus />
                    </button>
                    <span className="pf-qty-n" aria-live="polite">
                      {count}
                    </span>
                    <button type="button" className="pf-qty-btn" aria-label={t('oneMore', { name: s.name })} onClick={() => addOne(s)} aria-disabled={full || undefined}>
                      <IconPlus />
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {full ? (
        <div role="alert" className="pf-error">
          {nv.billFull(MAX_LINES)}
        </div>
      ) : null}

      <div className="pf-tray">
        {/*
          Two rows, not two columns: the label spans the width and the figure sits BESIDE the button, so the two
          things the eye compares share a centre line. Centring a button against a label-plus-figure block put
          ₹450 twelve pixels below Next, which reads as crooked even though the block itself was centred.
        */}
        {/*
          The whole strip opens the bill, not the two words at the end of it (owner, 2026-10-10).
          "View details" as a link inside a line of 14px text was a 23px-tall target sitting 2px above the total
          figure — a thumb aimed at one hit the other. One 44px button across the row is a target nobody can miss,
          and it reads the same.
        */}
        {lines.length > 0 ? (
          <button type="button" className="pf-total-label pf-total-label-tap" onClick={() => setBillOpen(true)}>
            <span className="pf-total-words">
              {t('onBill', { count: lines.length })}
              {override !== null && override !== listMinor ? ` · ${t('listPrice', { amount: money(listMinor) })}` : ''}
              {/* A no-break space after the dot: a plain one sits at the end of an inline box and collapses away. */}
              {' · '}
            </span>
            <span className="pf-view-bill">{t('viewDetails')}</span>
          </button>
        ) : (
          <span className="pf-total-label">{t('total')}</span>
        )}
        <button
          type="button"
          className="pf-total"
          aria-label={t('changeTotal')}
          onClick={() => setKeypad(rupeesText(totalMinor))}
          disabled={lines.length === 0}
        >
          <strong className="pf-total-figure">{money(totalMinor)}</strong>
        </button>
        {/*
          Two things stop Next, and each says which (owner, 2026-10-10). `aria-disabled` rather than `disabled`:
          a button that cannot answer teaches nothing, and "nothing happened" is the worst state on this screen.
          Missing a client opens the sheet as well as saying so — the complaint and the fix in one tap.
        */}
        {addingTo ? (
          <button type="button" className="btn pf-go" onClick={() => void addToOrder()} disabled={addingBusy} aria-busy={addingBusy}>
            {addingBusy ? t('desk.addingBusy') : t('desk.addToOrderShort', { token: addingTo.tokenLabel })}
          </button>
        ) : (
          <button type="button" className="btn pf-go" onClick={onNext} aria-disabled={!(canGoOn || (guestOptional && hasService))}>
            {/* An app's order is saved by this tap (nothing to collect), so it says so. */}
            {fromApp ? t('from.completeShort') : t('next')}
          </button>
        )}
      </div>
      {error ? (
        <div role="alert" className="pf-error pf-error-tray">
          {error}
        </div>
      ) : null}

      {whoOpen ? (
        <ClientSheet
          location={location}
          nameStaysOnBill={guestOptional}
          startAdding={whoOpen === 'add'}
          onPick={(c) => {
            // No id means a name and nothing else: there is no client row yet, and the sale is what writes it.
            setClient(c.id === null ? { kind: 'named', name: c.name ?? '', phone: c.waPhone } : { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone });
            setWhoOpen(false);
          }}
          onClose={() => setWhoOpen(false)}
        />
      ) : null}
      {discountSheet}
      {billOpen && lines.length > 0 ? (
        <BillCard
          offLabel={offPct !== null ? t('discount.billOffPct', { pct: offPct }) : undefined}
          lines={lines}
          listMinor={listMinor}
          totalMinor={totalMinor}
          onLess={(serviceId) => {
            oneLess(serviceId);
            if (lines.length === 1) setBillOpen(false);
          }}
          onPrice={openRowKeypad}
          onClose={() => setBillOpen(false)}
        />
      ) : null}
      {choosing !== null && products.some((p) => p.id === choosing) ? (
        <ChoiceSheet
          product={products.find((p) => p.id === choosing)!}
          groups={groupsOf(choosing)}
          onAdd={(choice, qty) => addChoice(products.find((p) => p.id === choosing)!, choice, qty)}
          onClose={() => setChoosing(null)}
        />
      ) : null}
      {sizing !== null && products.some((p) => p.id === sizing) ? (
        <SizeSheet
          counted={counted}
          product={products.find((p) => p.id === sizing)!}
          onBill={(variantId) => productCountOf(sizing, variantId)}
          full={full}
          onAdd={(size) => addProduct(products.find((p) => p.id === sizing)!, size)}
          onLess={(size) => oneLess(productLineKey(sizing, size.id))}
          onClose={() => setSizing(null)}
        />
      ) : null}
      {menuOpen && (services || productsOnly) ? (
        <ServiceSheet
          services={services ?? []}
          counts={new Map((services ?? []).map((s) => [s.id, countOf(s.id)]))}
          onPick={(s) => {
            addOne(s);
            setMenuOpen(false);
          }}
          products={products}
          productCounts={new Map(products.map((p) => [p.id, productCountOf(p.id)]))}
          onPickProduct={(p) => {
            addProduct(p);
            setMenuOpen(false);
            setSearchSeed(null);
          }}
          onClose={() => {
            setMenuOpen(false);
            setSearchSeed(null);
          }}
          packageCountOf={packageCountOf}
          onLessPackage={oneLessPackage}
          initialKind={productsOnly ? 'products' : initialTab}
          productsOnly={productsOnly}
          initialTerm={searchSeed?.text ?? ''}
        />
      ) : null}
      {keypad !== null ? (
        <Keypad
          title={keypadFor ? t('desk.priceFor', { name: keypadFor.name }) : t('keypadTitle')}
          value={keypad}
          hint={t('listPrice', { amount: money(keypadFor ? keypadFor.list : listMinor) })}
          onChange={setKeypad}
          onDone={() => {
            const rupees = Number(keypad);
            const ok = Number.isFinite(rupees) && keypad !== '';
            if (keypadFor) {
              if (ok) setRowPrice(keypadFor.key, Math.round(rupees * 100));
            } else setOverride(ok && Math.round(rupees * 100) !== listMinor ? Math.round(rupees * 100) : null);
            setKeypad(null);
            setKeypadFor(null);
          }}
          onClose={() => {
            setKeypad(null);
            setKeypadFor(null);
          }}
        />
      ) : null}
    </div>
  );
}
