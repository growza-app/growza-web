'use client';

import Link from '../../../shared/AppLink';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, formatMoney } from '../../lib/api';
import { fixVisitHref, nextCustomerHref } from '../../lib/pay-token';
import type { Appointment, Offer, PaymentMode, Product, ProductCategory, Provider, Service, TillSize } from '../../lib/api-types';
import type { QueueEntry } from '../../lib/home-types';
import { receiptRows, type ReceiptRow } from '../../lib/receipt-text';
import { displayPhone } from '../../lib/phone';
import { ServicePhoto } from '../../components/ServicePhoto';
import { ProductPhoto } from '../../components/ProductPhoto';
import { ALL_CATEGORIES, DeskProductCategories, NO_CATEGORY } from '../../products/DeskProductCategories';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useBranch } from '../../components/BranchProvider';
import { HeaderBranchPicker } from '../../components/HeaderBranchPicker';
import { PAYMENT_MODES } from '../../lib/payment-modes';
import { useLabel } from '../../components/LabelsProvider';
import { LargeAmountDeclined, useLargeAmountGuard } from '../../components/LargeAmountConfirm';
import { useSession } from '../../components/SessionProvider';
import { IconArrowLeft, IconClose, IconEdit, IconMinus, IconPayCard, IconPayCash, IconPayOther, IconPayUpi, IconPlus, IconSearch, IconUserPlus } from '../../components/icons';
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
import { SizeSheet } from './SizeSheet';
import { queueScan, takeScans } from '../../lib/scan-queue';
import { BUZZ, buzz, remember, remembered, SOUND_KEY } from '../../lib/pay-feedback';
import { PaymentDone } from '../../components/PaymentDone';

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
  bill: ReceiptRow[];
  phone: string | null;
  summary: string;
  /** The visit's own day in the salon's zone — what "Fix a mistake" needs to find it in the list. */
  day: string;
  /** Only products were sold: the id is a sale's, not a booking's, so there is nothing in Bookings to open. */
  productOnly: boolean;
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
  | { kind: 'named'; name: string }
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
}) {
  const t = useTranslations('payFlow');
  const ts = useTranslations('payFlow.size');
  const tcr = useTranslations('chrome');
  const nv = useNewVisitCopy();
  const locale = useLocale();
  const router = useRouter();
  const session = useSession();
  const branch = useBranch();
  const providerNoun = useLabel('provider', 'Staff member');
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
  /** Jira GRW-572 — the branch's priced combos, for the wide till's Packages tab. Empty until read, and on a phone. */
  const [offers, setOffers] = useState<Offer[]>([]);
  /** Owner, 2026-10-14 — the branch's shelf (migration 0115): the Products tab on the desk, a chip in the phone's sheet. */
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productsFailed, setProductsFailed] = useState(false);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [productCategory, setProductCategory] = useState<string>(ALL_CATEGORIES);
  const [client, setClient] = useState<Client>({ kind: 'none' });
  const [stylistId, setStylistId] = useState<string | null>(null);
  const [override, setOverride] = useState<number | null>(null);
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
  // Hooks stay above every early return below (done, qr, how): a sale that ends on one of them must not change the hook count.
  const noneCount = useMemo(() => products.filter((p) => p.categoryId === null).length, [products]);
  const phoneProducts = useMemo(() => {
    if (!productsOnly) return [];
    const byCat = productCategory
      ? products.filter((p) => (productCategory === NO_CATEGORY ? p.categoryId === null : p.categoryId === productCategory))
      : products;
    const inStock = byCat.filter((p) => p.stock > 0 || productCountOf(p.id) > 0);
    const shown = (inStock.length > 0 ? inStock : byCat).slice(0, TILES);
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
  }, [productsOnly, products, productCategory, lines]);
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
  const addProduct = (p: Product, size?: TillSize) => {
    // Jira GRW-599 — a product with sizes is not one thing to ring up: the size sheet opens, and a size goes on from there.
    if (!size && hasSizes(p)) {
      setSizing(p.id);
      return;
    }
    if (size) {
      if (full || !canAddSize(size, productCountOf(p.id, size.id))) {
        felt(BUZZ.tooMany);
        return;
      }
      felt(BUZZ.added);
      setLines((prev) => [...prev, { serviceId: '', name: sizedName(p, size), priceMinor: sizePriceMinor(p, size), product: { id: p.id, variantId: size.id } }]);
      setOverride(null);
      return;
    }
    if (full || p.stock <= 0 || productCountOf(p.id) >= p.stock) {
      felt(BUZZ.tooMany);
      return;
    }
    felt(BUZZ.added);
    setLines((prev) => [...prev, { serviceId: '', name: p.name, priceMinor: Number(p.priceMinor ?? 0), product: { id: p.id } }]);
    setOverride(null);
  };
  /**
   * Owner, 2026-10-19 — a scan adds the product wherever the cursor is. A code that names no single product says so
   * rather than doing nothing, because a silent miss at the counter reads as "the scanner is broken".
   */
  const [scanNote, setScanNote] = useState<string | null>(null);
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
    const { add, problem } = planScans(codes, products, productCountOf, lines.length, MAX_LINES);
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
  useBarcodeScan(productsOnly && step === 'what', (code) => {
    if (productsLoaded) onScans([code]);
    else queueScan(code);
  });
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
  };
  const [heldBills, setHeldBills] = useState<Array<{ id: string; client: Client; lines: Line[]; override: number | null }>>([]);
  const holdBill = () => {
    if (lines.length === 0) return;
    setHeldBills((prev) => [{ id: newAttemptKey(), client, lines, override }, ...prev]);
    setLines([]);
    setOverride(null);
    setClient({ kind: 'none' });
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
  const waysFor = (mode: PaymentMode): Array<{ mode: PaymentMode; amountMinor: number }> => {
    if (!firstWay || firstWay.mode === mode || firstWay.minor >= totalMinor) return [{ mode, amountMinor: totalMinor }];
    return [
      { mode: firstWay.mode, amountMinor: firstWay.minor },
      { mode, amountMinor: totalMinor - firstWay.minor },
    ];
  };
  const paidByWords = (ways: Array<{ mode: PaymentMode; amountMinor: number }>) =>
    ways.length > 1 ? ways.map((w) => `${modeWord(w.mode)} ${money(w.amountMinor)}`).join(' · ') : modeWord(ways[0]!.mode);
  const clearSplit = () => {
    setSplitting(false);
    setSplitKeypad(null);
    setSplitAmount('');
    setFirstWay(null);
  };

  /** ② — the tile that was tapped is the payment; this is the save. */
  const pay = async (mode: PaymentMode) => {
    if (saving || lines.length === 0) return;
    felt(BUZZ.paid);
    setSaving(mode);
    setError(null);
    const amounts = spread(baseAmounts.map((priceMinor) => ({ priceMinor })), totalMinor);
    const legs = lines.flatMap((l, i) => (l.product ? [] : [{ serviceId: l.serviceId, paidAmountMinor: amounts[i]!, ...(l.pkg ? { offerId: l.pkg.id } : {}) }]));
    // Owner, 2026-10-14 — the products on the bill, grouped: which, how many, what the line came to.
    // Jira GRW-599 — one entry per product, and per size of a product that has sizes (the size is what the server takes the unit from).
    const productLines = groupProductLines(lines, amounts);
    const soldProducts = productLines.length > 0 ? { products: productLines } : {};
    // Owner, 2026-10-14 — a bill paid two ways goes as `payments`; the legs' one word is the larger way's.
    const ways = waysFor(mode);
    const paidBy = paidByWords(ways);
    const mainMode = ways.reduce((best, w) => (w.amountMinor > best.amountMinor ? w : best), ways[0]!).mode;
    const howPaid = ways.length > 1 ? { paymentMode: mainMode, payments: ways } : { paymentMode: mode };
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
                ...(confirmed ? { confirmLargeAmount: true } : {}),
              }),
            );
            return {
              appointmentId: r.appointmentId,
              paidMinor: totalMinor,
              schedulableId: stylistId,
              startAt: visit.appointment.startAt,
              tokenNo: null as number | null,
            };
          })()
        : await (async () => {
            const who = token ? { queueEntryId: token.id } : client.kind === 'existing' ? { customerId: client.id } : { customerName: (client as { name: string }).name };
            const common = {
              ...who,
              services: legs,
              ...howPaid,
              ...soldProducts,
              idempotencyKey: attemptKey,
              ...(token || !location ? {} : { location }),
            };
            const r = await guard((confirmed) =>
              api.recordCounterSale(
                stylistId && legs.length > 0
                  ? { ...common, schedulableId: stylistId, ...(confirmed ? { confirmLargeAmount: true } : {}) }
                  : { ...common, noStylist: true, ...(confirmed ? { confirmLargeAmount: true } : {}) },
              ),
            );
            return {
              appointmentId: r.appointmentId,
              // Owner, 2026-10-14 — the legs are the services; the products on the bill are the rest of what was paid.
              paidMinor: r.legs.reduce((sum, l) => sum + l.paidAmountMinor, 0) + productLines.reduce((sum, p) => sum + p.paidMinor, 0),
              schedulableId: r.schedulableId,
              startAt: r.startAt,
              tokenNo: r.tokenNo ?? null,
            };
          })();
      const result = settled;
      router.refresh();
      const paidMinor = result.paidMinor;
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
      const tokenNo = result.tokenNo ?? token?.tokenNo ?? null;
      const bill = receiptRows(
        {
          businessName: session?.businessName ?? null,
          branchName,
          when,
          tokenNo,
          stylist,
          singles: lines.map((l, i) => ({ name: l.name, amountMinor: amounts[i]! })).filter((_, i) => !lines[i]!.pkg && !lines[i]!.product),
          products: lines.map((l, i) => ({ name: l.name, amountMinor: amounts[i]! })).filter((_, i) => lines[i]!.product),
          pkg: null,
          pkgs: pkgsOnBill.map((pkg) => ({
            title: pkg.title,
            services: lines.filter((l) => l.pkg?.key === pkg.key).map((l) => l.name),
            paidMinor: amounts.reduce((sum, a, i) => sum + (lines[i]!.pkg?.key === pkg.key ? a : 0), 0),
            separateMinor: lines.filter((l) => l.pkg?.key === pkg.key).reduce((sum, l) => sum + l.priceMinor, 0),
          })),
          totalMinor: paidMinor,
          paidBy,
        },
        {
          title: nv.receiptTitle,
          thanks: nv.receiptThanks,
          services: nv.receiptServices,
          products: nv.receiptProducts,
          token: nv.token,
          stylist: (name) => nv.receiptStylist(providerNoun, name),
          packageName: nv.receiptPackage,
          separately: nv.receiptSeparately,
          total: nv.receiptTotal,
          saved: nv.receiptSaved,
          paidBy: nv.receiptPaidBy,
          seeYou: nv.receiptSeeYou,
        },
        money,
      );
      const names = [...new Set(lines.map((l) => l.pkg?.title ?? l.name))].join(' + ');
      setSale({
        appointmentId: result.appointmentId,
        tokenNo,
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
        summary: [tokenNo !== null ? nv.token(tokenNo) : null, paidBy, names, stylist].filter(Boolean).join(' · '),
        day: new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(result.startAt)),
        productOnly: !lines.some((l) => !l.product),
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
        setError(sizeRefused ? ts('changed') : e instanceof ApiError ? e.message : nv.saveUnknown);
        if (e instanceof ApiError && e.field === 'products') void api.products(location).then(setProducts).catch(() => {});
      }
    } finally {
      setSaving(null);
    }
  };



  const nextCustomer = () => {
    setLines([]);
    setOverride(null);
    setClient({ kind: 'none' });
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
  }, [location, token]);

  const canGoOn = hasService && (token !== undefined || client.kind !== 'none');
  /*
   * Both complaints at once (owner, 2026-10-10).
   *
   * Next used to stop at the first thing missing: with neither a client nor a service it said only "Tap a
   * service first", and the owner learnt about the client on the NEXT tap. Two round trips to be told two
   * things the screen already knew. Each is now marked where it is missing, so one look answers both.
   */
  const onNext = () => {
    const service = !hasService;
    const client_ = !token && client.kind === 'none';
    if (service || client_) {
      setMissing({ client: client_, service });
      // The sheet opens over the screen, so it may only open when the client is the ONE thing missing —
      // otherwise it would cover the mark that says a service is missing too.
      if (client_ && !service) setWhoOpen('add');
      return;
    }
    setMissing(null);
    setStep('how');
  };

  /** Jira GRW-572 — the wide till has no Next: a payment tile does Next's check first, and marks what is missing. */
  const readyToPay = () => {
    const service = !hasService;
    const client_ = !token && client.kind === 'none';
    if (service || client_) {
      setMissing({ client: client_, service });
      if (client_ && !service) setWhoOpen('add');
      return false;
    }
    setMissing(null);
    return true;
  };

  // Marked only while still true, so answering one clears its own mark without clearing the other's.
  const badClient = Boolean(missing?.client) && !token && client.kind === 'none';
  const badService = Boolean(missing?.service) && !hasService;

  useEffect(() => {
    if (!productsOnly || !wide || step !== 'what') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        setWhoOpen('find');
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (saving !== null || lines.length === 0) return;
        if (!readyToPay()) return;
        if (paymentQr && !firstWay) setStep('qr');
        else void pay('upi');
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (lines.length > 0) holdBill();
        else if (heldBills.length > 0) resumeHeldBill(heldBills[0]!.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const leave = () => router.push(backTo ?? '/');
  const payToken = token ? `&token=${encodeURIComponent(token.id)}${token.locationId ? `&location=${encodeURIComponent(token.locationId)}` : ''}` : '';
  const simpleForm = `/appointments/new?purpose=payment${payToken}`;
  const fullForm = `/appointments/new?purpose=payment&full=1${payToken}`;

  /* ---------- ③ Done ---------- */
  // The same screen the one-page form ends on (owner, 2026-10-10): `PaymentDone`, sound, Next customer and all.
  if (step === 'done' && sale) {
    return (
      <PaymentDone
        appointmentId={sale.appointmentId}
        fixHref={sale.productOnly ? null : fixVisitHref(sale.appointmentId, sale.day)}
        totalMinor={sale.totalMinor}
        mode={sale.mode}
        modeLabel={sale.paidBy}
        summary={sale.summary}
        bill={sale.bill}
        phone={sale.phone}
        onNextCustomer={nextCustomer}
        onDone={leave}
        sound={sound}
        onToggleSound={toggleSound}
      />
    );
  }

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
        <p className="pf-how-total">
          <span className="pf-how-total-label">{t('total')}</span>
          <strong>{money(totalMinor)}</strong>
        </p>
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
        <button type="button" className="btn pf-go pf-qr-paid" onClick={() => void pay('upi')} disabled={saving !== null} aria-busy={saving === 'upi'}>
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
  const restMinor = firstWay ? Math.max(0, totalMinor - firstWay.minor) : 0;
  const payTiles = (
    <div className="pf-pay" role="group" aria-label={t('howTitle')}>
      {firstWay ? (
        /* The first way, held, and what the next tile is for. × puts the bill back to one way. */
        <p className="pf-split-held" role="status">
          <span>{t('split.then', { amount: money(firstWay.minor), mode: modeWord(firstWay.mode), rest: money(restMinor) })}</span>
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
          className={`pf-pay-tile pf-pay-${mode}`}
          /*
           * UPI is the one tile that may not be the save.
           *
           * With a QR uploaded it opens the QR for the customer to scan, and the money is recorded on the
           * next screen when it has actually arrived — recording it here would mark a sale paid before
           * anybody had scanned anything. Every other tile still saves on the tap (the Square model): cash
           * is in the hand, and the done screen's Fix a mistake is the way back.
           */
          onClick={() => {
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
          disabled={saving !== null}
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
      {!splitting && !firstWay ? (
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
          if (minor >= totalMinor) {
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
          <h1 className="pf-title">{t('howTitle')}</h1>
          <span className="pf-head-gap" aria-hidden="true" />
        </header>
        <p className="pf-how-total">
          <span className="pf-how-total-label">{t('total')}</span>
          <strong>{money(totalMinor)}</strong>
        </p>
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
        {splitKeypadEl}
        {dialog}
      </div>
    );
  }

  /* ---------- ① What did they get? ---------- */
  const who = token ? (
    <p className="pf-who-token">
      {token.tokenNo !== null ? `${nv.token(token.tokenNo)} · ` : ''}
      {token.customerName}
    </p>
  ) : (
    <div className="pf-row" role="group" aria-label={t('who')}>
      <span className="pf-row-label">{t('who')}</span>
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
        <div className={`pf-who-bar ${badClient ? 'pf-bad' : ''}`} ref={whoChips}>
          <button type="button" className="pf-who-search" onClick={() => setWhoOpen('find')}>
            <IconSearch />
            {t('nameOrNumber')}
          </button>
          <button type="button" className="pf-who-add" aria-label={t('addClient')} onClick={() => setWhoOpen('add')}>
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

  /* ---------- ① on a wide desk (Jira GRW-572): who · what · the bill, side by side ---------- */
  if (wide) {
    return (
      <div className="pf pf-wide">
        <header className="pf-head">
          <button type="button" className="pf-back" aria-label={nv.back} onClick={leave}>
            <IconArrowLeft />
          </button>
          <span className="pf-head-stack">
            <h1 className="pf-title">{productsOnly ? (heading ?? t('sellTitle')) : t('whatTitle')}</h1>
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
        {scanNote ? <div role="status" className="pf-error">{scanNote}</div> : null}
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
        <div className="pf-wide-grid">
          <aside className="pf-wide-left">
            {who}
            {productsOnly ? (
              <DeskProductCategories
                picked={productCategory}
                categories={productCategories}
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
                    categories={productCategories}
                    allCount={products.length}
                    noneCount={noneCount}
                    onPick={setProductCategory}
                  />
                ) : null
              }
            />
          )}
          <aside className="pf-wide-right">
            {productsOnly ? <div className="pos-bill-client">{who}</div> : null}
            {productsOnly && heldBills.length > 0 ? (
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
                      <button type="button" className="pos-bill-action pos-bill-hold" onClick={holdBill}>
                        {t('desk.holdBill')} <kbd>F9</kbd>
                      </button>
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
              <p className="pf-wide-empty">{productsOnly ? t('desk.emptyProductBill') : t('desk.emptyBill')}</p>
            ) : productsOnly ? (
              <PosBillRows
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
              <BillRows lines={lines} listMinor={listMinor} totalMinor={totalMinor} onLess={oneLess} onPrice={openRowKeypad} />
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
            <h2 className="pf-wide-h">{t('howTitle')}</h2>
            {payTiles}
            {productsOnly ? (
              <button
                type="button"
                className="btn pos-charge-cta"
                disabled={saving !== null || lines.length === 0}
                onClick={() => {
                  if (!readyToPay()) return;
                  if (paymentQr && !firstWay) setStep('qr');
                  else void pay('upi');
                }}
              >
                <span>{t('desk.chargeNow', { amount: money(totalMinor) })}</span>
                <kbd className="pos-charge-kbd">F8</kbd>
              </button>
            ) : null}
            {splitKeypadEl}
            {dialog}
          </aside>
        </div>
        {sizing !== null && products.some((p) => p.id === sizing) ? (
          <SizeSheet
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
            startAdding={whoOpen === 'add'}
            onPick={(c) => {
              setClient(c.id === null ? { kind: 'named', name: c.name ?? '' } : { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone });
              setWhoOpen(false);
            }}
            onClose={() => setWhoOpen(false)}
          />
        ) : null}
        {billOpen && lines.length > 0 ? (
          <BillCard
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
          <header className="pf-head">
            <button type="button" className="pf-back" aria-label={nv.back} onClick={leave}>
              <IconArrowLeft />
            </button>
            <span className="pf-head-stack">
              <h1 className="pf-title">{heading ?? t('sellTitle')}</h1>
              <HeaderBranchPicker variant="line" />
            </span>
            <span className="pf-head-gap" aria-hidden="true" />
          </header>
          {scanNote ? <div role="status" className="pf-error">{scanNote}</div> : null}
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
      {who}
      {productsOnly ? null : stylists}

      {/*
        The whole menu, under the two rows that name people and above the tiles it searches (owner, 2026-10-10).
        It was a "More…" tile at the END of the grid — eight photos away from the eye, and only reachable by
        scrolling past everything it exists to shortcut. A bar reads as "type what you are looking for"; the
        tiles below it stay the fast path for what is sold all day.
      */}
      {productsOnly && products.length > 0 ? (
        <>
          <div className="pf-row" role="group" aria-label={t('desk.products')}>
            <span className="pf-row-label">{t('desk.products')}</span>
            <div className="pf-who-bar">
              <button type="button" className="pf-who-search pf-find-service" onClick={() => setMenuOpen(true)}>
                <IconSearch />
                {t('desk.searchProducts', { count: products.length })}
              </button>
              <span className="pf-who-add pf-who-gap" aria-hidden="true" />
            </div>
          </div>
          {productCategories.length > 0 ? (
            <div className="pf-chips">
              <button
                type="button"
                className={`pf-chip ${productCategory === ALL_CATEGORIES ? 'pf-chip-on' : ''}`}
                aria-pressed={productCategory === ALL_CATEGORIES}
                onClick={() => setProductCategory(ALL_CATEGORIES)}
              >
                {t('allCategories')}
              </button>
              {productCategories.map((c) => (
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
              {t('searchCount')}
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
          <div className="empty">{products.length === 0 ? t('desk.noProducts') : t('desk.noMatch')}</div>
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
                    <span className="pf-tile-name">{p.name}</span>
                    <span className="pf-tile-price">
                      {money(price)}
                      <span className={`pf-tile-mins ${p.stock <= 0 ? 'pf-tile-out' : ''}`}>{p.stock <= 0 ? t('outOfStock') : t('left', { n: p.stock })}</span>
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
                  <span className="pf-tile-name">{s.name}</span>
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
        <button type="button" className="btn pf-go" onClick={onNext} aria-disabled={!canGoOn}>
          {t('next')}
        </button>
      </div>
      {error ? (
        <div role="alert" className="pf-error pf-error-tray">
          {error}
        </div>
      ) : null}

      {whoOpen ? (
        <ClientSheet
          location={location}
          startAdding={whoOpen === 'add'}
          onPick={(c) => {
            // No id means a name and nothing else: there is no client row yet, and the sale is what writes it.
            setClient(c.id === null ? { kind: 'named', name: c.name ?? '' } : { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone });
            setWhoOpen(false);
          }}
          onClose={() => setWhoOpen(false)}
        />
      ) : null}
      {billOpen && lines.length > 0 ? (
        <BillCard
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
      {sizing !== null && products.some((p) => p.id === sizing) ? (
        <SizeSheet
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
