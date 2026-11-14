'use client';

import { deltaLabel, deltaTone, periodDeltaPct } from './day-delta';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { paidCustomers } from '../../lib/paid-customers';
import type {
  AttendanceRegister,
  BestSellersPage,
  ByChannelPage,
  CustomerStats,
  OrderListRow,
  ReturnsReportPage,
  SellersRange,
  ShopHome as ShopHomeData,
  StockReportPage,
} from '../../lib/api-types';
import { homeCopy } from '../../lib/home-copy';
import { DaySummarySheet } from './DaySummarySheet';
import { CashDrawerLine } from './CashDrawer';
import { phoneWindow, type PhonePeriod } from '../../lib/phone-window';
import { canSee, canSeeRevenue, type MemberRole } from '../../lib/nav-policy';
import { ordersHref } from '../../lib/orders-filter';
import { formatTokenNo, posQueueStorageKey, queueStateOf, tokenNumbersOf, type PosTokenOverride } from '../../pos/pos-helpers';
import { channelsOf, isDeliveryApp, sellsOnMarketplaces } from '../../lib/order-channels';
import type { Lang } from '../../lib/lang';
import { useBranch } from '../BranchProvider';
import { useAreas } from '../SessionProvider';
import {
  IconNavClients,
  IconNavOrders,
  IconNavStock,
  IconSettings,
  IconChevronRight,
  IconDaySummary,
  IconPos,
  IconProducts,
  IconReports,
} from '../icons';
import { Avatar, Card, CardError, HomeHeader, QuickTiles, Segmented, exactRupees, rupees } from './parts';
import { CheckInCard } from './CheckInCard';
import { PaymentBar, PaymentLine } from './MoneyHero';
import { orderNumber } from '../../lib/order-number';
import { useDialog } from '../../../shared/a11y/useDialog';

type ShopPeriod = 'last_7_days' | 'this_month' | 'last_3_months';



/**
 * Jira GRW-609 — a shop's Home: the money, the orders waiting to go out, and the sizes running out before the season.
 *
 * Its own Home kind, chosen by `page.tsx` BEFORE anything else is read (as NotLiveHome is), so none of the salon's
 * eight reads runs for a shop and nothing here is a conditional inside the owner's Home. One request serves the whole
 * screen (`api.shopHome`), narrowed to a branch when the owner has picked one; on laptop (`.hm-desk-v3`) the owner's
 * command center also reads the retail channel, best-seller, stock and order lists so the 4-row layout matches the
 * salon command center in density and polish.
 */
export function ShopHome({
  lang,
  labels,
  businessName,
  dateLabel,
  greetingPart,
  locationName,
  role,
  reportTabs,
  initial,
  timezone,
  attendanceMonth = null,
}: {
  lang: Lang;
  labels: Record<string, string>;
  businessName: string;
  dateLabel: string;
  greetingPart: 'morning' | 'afternoon' | 'evening';
  locationName: string | null;
  role: MemberRole | null;
  reportTabs?: string[];
  /** The whole-business read the server made; null when it failed. */
  initial: ShopHomeData | null;
  timezone?: string;
  /** Jira GRW-76 — a staff-kind role holder's own month, for the check-in card; null for everyone else. */
  attendanceMonth?: AttendanceRegister | null;
}) {
  const t = homeCopy(lang, labels);
  const s = t.shop;
  const areas = useAreas();
  const branchContext = useBranch();
  const branch = branchContext.ready && branchContext.multi ? branchContext.choice : null;
  // The takings follow the role's Reports page for a role holder (the API sends them on the same rule), the fixed role otherwise.
  const money = areas.pages ? (areas.pages.reports ?? 'none') !== 'none' : canSeeRevenue(role);
  const can = (href: string) => canSee(href, role, reportTabs, true, areas);
  // Owner, 2026-10-24 — a business that sells on no marketplace ships nothing: no "to send", no "packed and sent".
  const ships = sellsOnMarketplaces(areas);
  const canReports = role === null || role === 'owner' || role === 'manager';

  const [data, setData] = useState<ShopHomeData | null>(initial);
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<ShopPeriod>('last_7_days');
  const isKitchen = !areas.stock;

  // Desktop command-center supplemental state
  const [channelData, setChannelData] = useState<ByChannelPage | null>(null);
  const [sellersData, setSellersData] = useState<BestSellersPage | null>(null);
  const [stockData, setStockData] = useState<StockReportPage | null>(null);
  const [returnsData, setReturnsData] = useState<ReturnsReportPage | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderListRow[]>([]);
  const [todayOrderRows, setTodayOrderRows] = useState<OrderListRow[]>([]);
  const [queueTick, setQueueTick] = useState(0);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);

  // The branch the data on screen is for: the server's read is every branch, so a pick re-reads and a return to "all" does too.
  const loadedFor = useRef<string | null>(null);
  const deskReqId = useRef(0);

  /*
   * Jira GRW-643 — which Home is actually on screen. 860px is the SAME edge `.shp-mobile-stack` is hidden at
   * (99-shop-home.css), so `phone === true` is exactly "the mobile stack is the one being looked at". It starts
   * null — nothing is known before mount — and neither feed runs on a guess.
   *
   * This is what keeps the period filter from costing anything: a laptop makes none of the phone's reads, and a
   * phone makes none of the command center's five, which it has never been able to see.
   */
  const [phone, setPhone] = useState<boolean | null>(null);
  /** The end-of-day sheet. Fetched when opened, like the salon's: most visits to Home never open it. */
  const [summaryOpen, setSummaryOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const read = () => setPhone(mq.matches);
    read();
    mq.addEventListener('change', read);
    return () => mq.removeEventListener('change', read);
  }, []);

  useEffect(() => {
    const refreshQueue = () => setQueueTick((n) => n + 1);
    window.addEventListener('storage', refreshQueue);
    window.addEventListener('focus', refreshQueue);
    window.addEventListener('pageshow', refreshQueue);
    return () => {
      window.removeEventListener('storage', refreshQueue);
      window.removeEventListener('focus', refreshQueue);
      window.removeEventListener('pageshow', refreshQueue);
    };
  }, []);

  const [phonePeriod, setPhonePeriod] = useState<PhonePeriod>('today');
  const [phoneChannel, setPhoneChannel] = useState<ByChannelPage | null>(null);
  const [phoneSellers, setPhoneSellers] = useState<BestSellersPage | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  /*
   * Owner's review 2026-11-13 — "failed" is a read that was refused, not a read not yet made. With only `busy`
   * to go on, the hero called its starting state (nothing read, nothing in flight) a failure, so every arrival
   * on Home painted "Could not load this" for ~400ms until the effect fired. Set by the window read's catch alone.
   */
  const [phoneFailed, setPhoneFailed] = useState(false);
  /** Bumped by the hero's "Try again": the window has not changed, so only a new dep re-runs the read. */
  const [phoneRetry, setPhoneRetry] = useState(0);
  const phoneReqId = useRef(0);
  const [payMenu, setPayMenu] = useState(false);
  const payMenuRef = useRef<HTMLDivElement>(null);
  useDialog(payMenuRef, { onClose: () => setPayMenu(false), active: payMenu, trapTab: false });
  useEffect(() => {
    if (!payMenu) return;
    const close = (e: PointerEvent) => {
      if (!payMenuRef.current?.parentElement?.contains(e.target as Node)) setPayMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [payMenu]);

  const load = (location: string | null) => {
    setLoading(true);
    api
      .shopHome(location)
      .then((d) => {
        setData(d);
        setFailed(false);
        loadedFor.current = location;
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (branch === loadedFor.current) return;
    load(branch);
    // `load` only closes over setters; the branch is the one input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch]);

  // Load desktop command-center feeds whenever branch or period changes
  useEffect(() => {
    /*
     * Jira GRW-643 — not on a phone: every one of these five feeds only the command center, which is
     * `display:none` below 861px. It used to run there and throw the answers away.
     *
     * `!== false`, not `=== true`: `phone` is null until the media query is read on mount, and a guard
     * that let null through would run this whole set once on null and again on false — a second round of
     * five requests on every laptop load. Waiting one tick for the answer costs nothing and asks once.
     */
    if (phone !== false) return;
    const mine = ++deskReqId.current;
    const loc = branch ?? undefined;
    const range: SellersRange = period;

    if (can('/orders')) {
      // Nothing is ever waiting to be sent where nothing ships (a kitchen): that list is not asked for.
      api
        .orders({ pageSize: 6, location: branch })
        .then((res) => {
          if (mine === deskReqId.current) setRecentOrders(res.rows);
        })
        .catch(() => {});
    }

    if (isKitchen && can('/customers')) {
      api
        .customerStats(loc)
        .then((res) => {
          if (mine === deskReqId.current) setCustomerStats(res);
        })
        .catch(() => {});
    }

    if (money && canReports) {
      if (can('/stock/channels')) {
        api
          .byChannel({ range, location: loc })
          .then((res) => {
            if (mine === deskReqId.current) setChannelData(res);
          })
          .catch(() => {});
      }
      if (can('/stock/sellers')) {
        api
          .bestSellers({ range, location: loc, pageSize: 5 })
          .then((res) => {
            if (mine === deskReqId.current) setSellersData(res);
          })
          .catch(() => {});
      }
      if (can('/stock/report')) {
        api
          .stockReport({ location: loc, pageSize: 1 })
          .then((res) => {
            if (mine === deskReqId.current) setStockData(res);
          })
          .catch(() => {});
      }
      if (can('/orders/returns')) {
        api
          .returnsReport({ range, location: loc })
          .then((res) => {
            if (mine === deskReqId.current) setReturnsData(res);
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, period, money, canReports, phone]);

  /*
   * Jira GRW-643 — the phone's own read, one window at a time.
   *
   * The money a phone shows used to be `shopHome`'s fixed today/yesterday pair, which no filter could move.
   * `by-channel` answers any of the report ranges with the billed total, the order count AND the comparison
   * against the equal-length period before it, so the filter moves real figures rather than relabelling one.
   *
   * It runs only where it is read (`phone === true`) and only where the owner may see both the money and the
   * channel report — the same two gates the hero itself is behind. An owner who may see takings but not that
   * report keeps the hero exactly as it was: today's figure, no filter (see `phoneFigures` below).
   */
  const canPhoneRange = money && canReports && can('/stock/channels');
  useEffect(() => {
    if (phone !== true) return;
    const mine = ++phoneReqId.current;
    const w = phoneWindow(phonePeriod, timezone, new Date());

    // The rows the Recent orders card below the hero lists. The command center's own `api.orders` read no
    // longer runs on a phone, so the phone asks for its own — NOT narrowed to the window, because
    // "recent" means the last orders, which is not a question the period filter asks.
    // Owner, 2026-11-13 (IO) — one read, not two: the six most recent are the first six of the hundred the
    // queue card and the customers count already read, same sort, same branch.
    if (can('/orders')) {
      api
        .orders({ pageSize: 100, location: branch })
        .then((res) => {
          if (mine !== phoneReqId.current) return;
          setTodayOrderRows(res.rows);
          setRecentOrders(res.rows.slice(0, 6));
        })
        .catch(() => {});
    }

    // Everything below is the hero's window, and is behind the hero's own two gates.
    if (!canPhoneRange) return;
    setPhoneBusy(true);
    api
      .byChannel({ ...w, location: branch ?? undefined })
      .then((res) => {
        if (mine !== phoneReqId.current) return;
        setPhoneChannel(res);
        setPhoneFailed(false);
      })
      .catch(() => {
        if (mine !== phoneReqId.current) return;
        setPhoneChannel(null);
        setPhoneFailed(true);
      })
      .finally(() => {
        if (mine === phoneReqId.current) setPhoneBusy(false);
      });
    // The top seller is read for the SAME window as the money above it. Asked for the command center's
    // range instead, the hero would name last quarter's best dish under today's takings.
    // Owner, 2026-11-13 — a shop's phone lists its three best; the figure was read for one and shown for none.
    if (areas.stock && can('/customers')) {
      api
        .customerStats(branch ?? undefined)
        .then((res) => {
          if (mine === phoneReqId.current) setCustomerStats(res);
        })
        .catch(() => {});
    }
    if (can('/stock/sellers')) {
      api
        .bestSellers({ ...w, location: branch ?? undefined, pageSize: 3 })
        .then((res) => {
          if (mine === phoneReqId.current && !isKitchen) setPhoneSellers(res);
        })
        .catch(() => {
          if (mine === phoneReqId.current) setPhoneSellers(null);
        });
      if (isKitchen) {
        api
          .bestSellers({ ...w, location: branch ?? undefined, pageSize: 4 })
          .then((res) => {
            if (mine === phoneReqId.current) setPhoneSellers(res);
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, phonePeriod, branch, canPhoneRange, timezone, phoneRetry]);

  /*
   * Jira GRW-611 review — no Reports tile. Every report there is built from bookings, so `/reports` answers a shop
   * with the "not yet" sentence (Jira GRW-610) whose only two buttons are Orders and Stock — two of these tiles. A
   * door onto that is a door onto nothing; it opens when a shop has reports of its own, Jira GRW-591.
   */
  const stockBranch = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  /*
   * The salon's Quick links are eight tiles, four across, two rows — enough that the grid reads as a
   * pad of shortcuts rather than three icons with a gap beside them. A shop has the same screens to
   * reach; it was only ever offered three of them.
   */
  const tiles = [
    { href: '/pos', label: t.nav.pos, icon: <IconPos />, tone: 'green' },
    // Only a kitchen has an order queue to open (hasOrderQueue); a shop's tile would open Sell.
    ...(isKitchen ? [{ href: '/pos?mode=queue', label: s.queueTitle, icon: <IconNavOrders />, tone: 'blue' }] : []),
    { href: '/stock', label: t.nav.stock, icon: <IconNavStock />, tone: 'green' },
    { href: '/customers', label: t.nav.clients, icon: <IconNavClients />, tone: 'amber' },
    /*
     * Owner, 2026-10-26 — Reports, not Attendance.
     *
     * Six tiles is the pad; which six is the question. A restaurant owner opens Home to see how the day
     * went and reaches Reports from it several times a shift, while attendance is marked once a morning by
     * whoever opens up and is a tap away in the nav either way. The one that earns a tile is the one that
     * is wanted repeatedly.
     */
    { href: '/reports', label: t.nav.reports, icon: <IconReports />, tone: 'violet' },
    { href: '/settings', label: t.nav.settings, icon: <IconSettings />, tone: 'slate' },
  ].filter((l) => canSee(l.href, role, reportTabs, true, areas));

  const periodLabel = period === 'last_7_days' ? s.range7d : period === 'this_month' ? s.rangeMonth : s.range90d;

  const channelWord = (c: string) =>
    c === 'counter'
      ? s.counterChannel
      : c === 'flipkart'
        ? s.flipkartChannel
        : c === 'amazon'
          ? s.amazonChannel
          : c === 'swiggy'
            ? s.swiggyChannel
            : c === 'zomato'
              ? s.zomatoChannel
              : c.charAt(0).toUpperCase() + c.slice(1);

  const stateWord = (status: string) =>
    status === 'done'
      ? s.stateDone
      : status === 'new'
        ? s.stateNew
        : status === 'packed'
          ? s.statePacked
          : status === 'sent'
            ? s.stateSent
            : status === 'delivered'
              ? s.stateDelivered
              : status === 'cancelled'
                ? s.stateCancelled
                : status === 'returned'
                  ? s.stateReturned
                  : status;

  const stateTone = (status: string) =>
    status === 'done' || status === 'delivered'
      ? 'green'
      : status === 'sent'
        ? 'blue'
        : status === 'new' || status === 'packed'
          ? 'amber'
          : 'rose';

  const formatShortDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(new Date(iso));
    } catch {
      return formatShortDate(iso);
    }
  };

  /**
   * QA 2026-11-06 — "Needs attention" on a laptop said "2 menu items are running low" and "1 order is waiting for more than 15
   * min" whatever the restaurant held: the numbers were typed into the markup from the design mock. These are counted from what
   * the restaurant has. Low stock only once the shelf has been counted (a kitchen that does not count has none to report), and
   * waiting orders from the recent orders the card already lists — a bill kept pending in the queue and not yet paid.
   */
  const attention: Array<{ key: 'stock' | 'pending'; tone: 'amber' | 'rose'; title: string; sub: string; href: string }> = [];
  if (data?.running.counted && data.running.total > 0) {
    attention.push({
      key: 'stock',
      tone: 'amber',
      title: s.lowStockShort,
      sub: s.menuItemsLowSub(data.running.total),
      href: can('/stock') ? `/stock${stockBranch}` : '/products',
    });
  }
  const waitingForPayment = recentOrders.filter((o) => o.paymentPending).length;
  if (waitingForPayment > 0) {
    attention.push({ key: 'pending', tone: 'rose', title: s.pendingOrdersTitle, sub: s.pendingPaymentSub(waitingForPayment), href: '/orders' });
  }

  // Build SVG polyline + bar chart from channelData.trend
  const trendChart = useMemo(() => {
    const raw = channelData?.trend ?? [];
    if (raw.length === 0) {
      return {
        ticks: [] as string[],
        points: [],
        polyPoints: '',
        areaPoints: '',
        maxMinor: 1,
        totalMinor: 0,
        dailyAvgMinor: 0,
        peakDay: null as { dateShort: string; revenueMinor: number } | null,
      };
    }
    const buckets = raw.slice(-7).map((b) => {
      const revenueMinor = Object.values(b.billedMinor).reduce((sum, v) => sum + Number(v || 0), 0);
      const parsed = Date.parse(`${b.startISO.slice(0, 10)}T12:00:00Z`);
      const dateShort = Number.isFinite(parsed)
        ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(new Date(parsed))
        : b.label;
      return { key: b.startISO, revenueMinor, dateShort };
    });
    const totalMinor = buckets.reduce((acc, b) => acc + b.revenueMinor, 0);
    const dailyAvgMinor = buckets.length > 0 ? Math.round(totalMinor / buckets.length) : 0;
    const maxMinor = Math.max(10000, ...buckets.map((b) => b.revenueMinor));
    let peakIdx = 0;
    buckets.forEach((b, i) => {
      if (b.revenueMinor >= (buckets[peakIdx]?.revenueMinor ?? 0)) peakIdx = i;
    });
    const peakBucket = buckets[peakIdx];
    const peakDay = peakBucket && peakBucket.revenueMinor > 0 ? { dateShort: peakBucket.dateShort, revenueMinor: peakBucket.revenueMinor } : null;
    const fmtTick = (minor: number) => {
      const r = Math.round(minor / 100);
      if (r >= 1000) return `₹${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}k`;
      return `₹${r}`;
    };
    const ticks = [fmtTick(maxMinor), fmtTick(Math.round(maxMinor * 0.66)), fmtTick(Math.round(maxMinor * 0.33)), '₹0'];
    const n = Math.max(buckets.length, 1);
    const gapPct = 2.0;
    const colPct = (100 - gapPct * Math.max(0, n - 1)) / n;
    const points = buckets.map((d, idx) => {
      const pct = d.revenueMinor > 0 ? Math.min(92, Math.max(10, Math.round((d.revenueMinor / maxMinor) * 100))) : 0;
      const x = idx * (colPct + gapPct) + colPct / 2;
      const y = 100 - pct;
      return { ...d, pct, x, y, isPeak: idx === peakIdx && d.revenueMinor > 0 };
    });
    const polyPoints = points.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const firstX = points[0]?.x.toFixed(1) ?? '0';
    const lastX = points[points.length - 1]?.x.toFixed(1) ?? '100';
    const areaPoints = points.length > 1 ? `${firstX},100 ${polyPoints} ${lastX},100` : '';
    return { ticks, points, polyPoints, areaPoints, maxMinor, totalMinor, dailyAvgMinor, peakDay };
  }, [channelData, lang]);

  const channelBreakdown = useMemo(() => {
    const byKey = new Map((channelData?.channels ?? []).map((c) => [c.channel, c]));
    const totalBilled = Math.max(1, Number(channelData?.totals.billedMinor ?? 0));
    return channelsOf(areas).map((key) => {
      const row = byKey.get(key);
      const billed = Number(row?.billedMinor ?? 0);
      const orders = row?.orders ?? 0;
      const avg = row?.averageMinor ?? null;
      const returned = row?.returnedOrders ?? 0;
      const sharePct = totalBilled > 0 && billed > 0 ? Math.max(6, Math.round((billed / totalBilled) * 100)) : 0;
      return {
        key,
        label: channelWord(key),
        billed,
        orders,
        avg,
        returned,
        sharePct,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelData, lang, areas]);
  /** Whether anything sold outside the counter in the range — only then is a split by channel worth a line. */
  const soldElsewhere = channelBreakdown.some((ch) => ch.key !== 'counter' && ch.billed > 0);

  const topSeller = sellersData?.rows?.[0] ?? null;
  const totalReturnedOrders =
    (returnsData ? returnsData.customer.returns + returnsData.undelivered.returns : null) ??
    channelData?.totals.returnedOrders ??
    0;

  /*
   * Jira GRW-643 — the figures the phone hero draws, for the window the filter is on.
   *
   * `kind` is the honest part. `'range'` means by-channel answered and every number below belongs to the
   * chosen window. `'today'` means this owner has no channel report, so the hero stays exactly the screen
   * they had before this change: `shopHome`'s today, and no filter above it to suggest otherwise. `'busy'`
   * and `'failed'` draw their own line rather than leaving the previous window's money under a new label —
   * a stale figure that looks current is worse on this screen than no figure.
   */
  const phoneFigures = useMemo(() => {
    if (!canPhoneRange) {
      if (!money || data?.today.takingsMinor === undefined) return { kind: 'none' as const };
      return {
        kind: 'today' as const,
        takingsMinor: data.today.takingsMinor,
        orders: data.today.orders,
        previousMinor: data.yesterday.takingsMinor ?? 0,
        byPaymentMode: data.today.byPaymentMode ?? [],
        fromAppsMinor: data.today.fromAppsMinor,
        cashDrawer: data.today.cashDrawer,
      };
    }
    // Not yet read is the skeleton, not the error: only a refused read says "failed" (owner's review 2026-11-13).
    if (!phoneChannel) return { kind: phoneFailed && !phoneBusy ? ('failed' as const) : ('busy' as const) };
    const takingsMinor = Number(phoneChannel.totals.billedMinor || 0);
    const orders = phoneChannel.totals.orders;
    return {
      kind: 'range' as const,
      takingsMinor,
      orders,
      // Absent, not zero, when there is no comparable period — the API says so with `previous.hasData`.
      changePct: phoneChannel.previous.hasData ? phoneChannel.totals.changePct : null,
      // Said beside the count, never subtracted from it — see `cameBack` in home-copy.
      returnedOrders: phoneChannel.totals.returnedOrders,
      // An average over no orders is not 0, it is nothing; the card draws a dash.
      avgMinor: orders > 0 ? Math.round(takingsMinor / orders) : null,
      byPaymentMode: phoneChannel.byPaymentMode ?? (phonePeriod === 'today' ? data?.today.byPaymentMode ?? [] : []),
      // Today's till only: the notes in it are a fact about this day, not about a week or a month.
      cashDrawer: phonePeriod === 'today' ? data?.today.cashDrawer : undefined,
      // And the apps' share of today, for the same reason: the channel report already carries the other periods.
      fromAppsMinor: phonePeriod === 'today' ? data?.today.fromAppsMinor : undefined,
      busy: phoneBusy,
    };
  }, [canPhoneRange, money, data, phoneChannel, phoneBusy, phoneFailed, phonePeriod]);

  /*
   * The hero's bars: one per day of the chosen window, from the same response as the money above them.
   * Fewer than two buckets is not a trend (a single day is one bar saying nothing), and a window with no
   * sales at all is drawn as nothing rather than a flat row of stubs pretending to be a reading.
   */
  const phoneSpark = useMemo(() => {
    const raw = phoneChannel?.trend ?? [];
    if (raw.length < 2) return [];
    const buckets = raw.slice(-14).map((b) => ({
      key: b.startISO,
      minor: Object.values(b.billedMinor).reduce((sum, v) => sum + Number(v || 0), 0),
    }));
    const max = Math.max(...buckets.map((b) => b.minor));
    // Two days that SOLD, not two days in the window. A month with one busy day drew 22 hairlines and one
    // block, which reads as a broken chart rather than as "you sold on one day" — and the Home says that
    // already, in the figure above. One point is not a trend.
    if (max <= 0 || buckets.filter((b) => b.minor > 0).length < 2) return [];
    return buckets.map((b) => ({ key: b.key, pct: b.minor > 0 ? Math.max(8, Math.round((b.minor / max) * 100)) : 3 }));
  }, [phoneChannel]);

  const phonePeriodOptions: Array<{ value: PhonePeriod; label: string }> = [
    { value: 'today', label: s.periodToday },
    { value: 'yesterday', label: s.periodYesterday },
    { value: 'this_week', label: s.periodWeek },
    { value: 'this_month', label: s.periodMonth },
  ];
  const phonePeriodWord = phonePeriodOptions.find((o) => o.value === phonePeriod)?.label ?? s.periodToday;

  /*
   * The API counts these over the same list `total` is of (sports-shop QA, 13 Nov 2026). This used to be counted
   * from `stockData`, a five-style page of the stock report, so Home said "1 out of stock" over four "None left"
   * rows. An older API without `out` falls back to the rows listed, which can only undercount, never disagree.
   */
  const outOfStockCount = data?.running.out ?? (data?.running.items ?? []).filter((i) => i.left <= 0).length;
  const lowOnlyCount = Math.max(0, (data?.running.total ?? 0) - outOfStockCount);

  /** The laptop's Needs attention card: what is waiting on the owner, each count only when it is not zero. */
  const counted = areas.stock && !!data?.running.counted;
  /*
   * QA 13 Nov 2026, bug 1 — Home said "Out of stock 5 · Running low 18" over a Stock screen showing 1 and 9, and both rows
   * opened the shelf on "All". The counts are now the Stock screen's own (`running.shelf`, products not sizes), and each
   * row opens that branch's shelf on that filter. On All branches a branch with any gets its own row, named, since the
   * Stock screen shows one branch at a time. An API older than this has no `shelf` and keeps the old two rows.
   */
  const shelfRows = (outTone: string, lowTone: string) => {
    if (!counted) return [];
    const shelf = data?.running.shelf;
    const stockHref = (locationId: string, filter: 'out' | 'low') =>
      can('/stock') ? `/stock?branch=${encodeURIComponent(locationId)}&filter=${filter}` : null;
    if (!shelf) {
      return [
        { key: 'out', tone: outTone, n: outOfStockCount, label: s.outOfStockChip, href: can('/stock') ? `/stock${stockBranch}` : null },
        { key: 'low', tone: lowTone, n: lowOnlyCount, label: s.runningLowChip, href: can('/stock') ? `/stock${stockBranch}` : null },
      ];
    }
    const named = (label: string, branchName?: string) => (branchName ? `${label} · ${branchName}` : label);
    return [
      ...shelf.map((b) => ({ key: `out-${b.locationId}`, tone: outTone, n: b.out, label: named(s.outOfStockChip, b.branch), href: stockHref(b.locationId, 'out') })),
      ...shelf.map((b) => ({ key: `low-${b.locationId}`, tone: lowTone, n: b.low, label: named(s.runningLowChip, b.branch), href: stockHref(b.locationId, 'low') })),
    ];
  };
  const attentionChips = [
    { key: 'send', tone: 'amber', n: ships ? (data?.toSend ?? 0) : 0, label: s.waitingToSendLabel, href: can('/orders') ? ordersHref({ status: 'new,packed' }) : null },
    {
      key: 'back',
      tone: 'rose',
      /*
       * QA 2026-11-14, F6 — the laptop said "15 Returns" (the report's last seven days) over a phone saying "Returns
       * today 8". Needs attention is what is waiting NOW, so both count today's (`cameBackToday`, bug 2's figure); an
       * API older than that keeps the period's count and its old label.
       */
      n: data?.cameBackToday ?? totalReturnedOrders,
      label: data?.cameBackToday !== undefined ? s.returnsTodayLabel : s.cameBackLabel,
      href: canReports && can('/orders/returns') ? '/orders/returns' : can('/orders') ? ordersHref({ status: 'returned' }) : null,
    },
    ...shelfRows('rose', 'amber'),
    // QA 2026-11-14, F10 — a row is a door: one this person cannot open is not drawn (see `attentionReachable`).
  ].filter((c) => c.n > 0 && c.href !== null);
  const attentionCount = attentionChips.reduce((sum, c) => sum + c.n, 0);
  /*
   * QA 2026-11-14, F10 — Needs attention is a list of things to go and do. A staff role that opens neither the shelf nor
   * the orders (attendance only) was shown "Out of stock 1 · Running low 12 · Returns today 6", and on a laptop four
   * product rows that opened /stock and bounced him Home. Such a person gets no card at all; anyone else gets only the
   * rows they can open.
   */
  const attentionReachable = can('/stock') || can('/orders');

  /*
   * Owner, 2026-11-13 — the phone's Needs attention card, for a shop with a counted shelf: the same four counts the
   * laptop chips carry, as rows with a door each. Returns come from the phone's own window read (`phoneChannel`),
   * since the command center's reports never run below 861px. Zero rows are not drawn.
   */
  const phoneAttention = [
    ...shelfRows('is-out', ''),
    { key: 'send', tone: '', n: ships ? (data?.toSend ?? 0) : 0, label: s.waitingToSendLabel, href: can('/orders') ? ordersHref({ status: 'new,packed' }) : null },
    {
      key: 'back',
      tone: 'is-out',
      /*
       * QA 13 Nov 2026, bug 2 — a live count like the other three, so the card's total is the same on every period
       * (it read 51 on Today and 50 on the rest). An API older than this falls back to the Today-only figure.
       */
      n: data?.cameBackToday ?? (phonePeriod === 'today' ? (phoneChannel?.totals.returnedOrders ?? 0) : 0),
      label: s.returnsTodayLabel,
      href: canReports && can('/orders/returns') ? '/orders/returns' : can('/orders') ? ordersHref({ status: 'returned' }) : null,
    },
  ].filter((c) => c.n > 0 && c.href !== null);

  /*
   * Who came in today: the day's paid orders, one customer each — a named buyer once however many times they bought,
   * a nameless walk-in every time. Read from the same hundred most recent orders the queue card uses, so a day of
   * more than a hundred orders is under-counted here exactly as it is there.
   */
  /** The day a moment falls on in the business's zone, as YYYY-MM-DD — one formatter per zone, shared below. */
  const fmtDate = useMemo(() => {
    let f: Intl.DateTimeFormat | null = null;
    try {
      f = new Intl.DateTimeFormat('en-CA', { ...(timezone ? { timeZone: timezone } : {}) });
    } catch {
      f = null;
    }
    return (d: Date) => (f ? f.format(d) : d.toISOString().slice(0, 10));
  }, [timezone]);
  /*
   * QA 13 Nov 2026, bug 4 — the API's count (`customersToday`), the same for every role: the hundred-order read below
   * runs only for a role that may open Orders, so a desk's card said 0. An older API falls back to counting those rows.
   */
  const apiCustomersToday = data?.customersToday;
  const customersToday = useMemo(() => {
    if (typeof apiCustomersToday === 'number') return apiCustomersToday;
    const todayISO = fmtDate(new Date());
    const named = new Set<string>();
    let walkIns = 0;
    for (const o of todayOrderRows) {
      if (o.status === 'cancelled' || o.status === 'returned' || o.items <= 0) continue;
      const ms = Date.parse(o.soldAt);
      if (Number.isNaN(ms) || fmtDate(new Date(ms)) !== todayISO) continue;
      const name = o.who?.name?.trim();
      if (name) named.add(name.toLowerCase());
      else walkIns += 1;
    }
    return named.size + walkIns;
  }, [apiCustomersToday, todayOrderRows, fmtDate]);

  /*
   * Jira GRW-679 (UX-04) — compared with yesterday only once today has something in it, and only against a
   * yesterday that had something (`periodDeltaPct`). These two used to answer "+12%" and "+4%" when yesterday was
   * empty: numbers that were not worked out from anything.
   */
  const salesDeltaPct = useMemo(() => periodDeltaPct(data?.today.takingsMinor ?? 0, data?.yesterday.takingsMinor ?? 0), [data]);
  const ordersDeltaPct = useMemo(() => periodDeltaPct(data?.today.orders ?? 0, data?.yesterday.orders ?? 0), [data]);

  // The count of guests, or nothing until it has loaded. It used to read 86 while loading, and always carried a
  // "+11%" beside it that no figure stood behind; the badge is gone until there is a real comparison to draw.
  // Owner, 9 Nov 2026 — only guests who have paid: a cancelled order's guest is not counted (`paidCustomers`).
  const customersTotal = paidCustomers(customerStats);

  const queueStats = useMemo(() => {
    const todayISO = fmtDate(new Date());
    const sourceRows = todayOrderRows.length >= recentOrders.length ? todayOrderRows : recentOrders;
    // QA 2026-11-06 — numbered over EVERY order of the day, like the POS and the receipt; only then is it narrowed to
    // what this card lists. Numbering the narrowed list made a returned order shift every later token down by one.
    const tokenNoOf = tokenNumbersOf(sourceRows, (ms) => fmtDate(new Date(ms)) === todayISO);
    const todaySorted = sourceRows
      .filter((o) => {
        if (o.status === 'cancelled' || o.status === 'returned' || o.items <= 0) return false;
        const ms = Date.parse(o.soldAt);
        return Number.isFinite(ms) && fmtDate(new Date(ms)) === todayISO;
      })
      .sort((a, b) => {
        const ta = Date.parse(a.soldAt) || 0;
        const tb = Date.parse(b.soldAt) || 0;
        return ta !== tb ? ta - tb : a.id.localeCompare(b.id);
      });

    const resolvedLoc = branch ?? branchContext.choice ?? branchContext.one ?? todaySorted[0]?.locationId ?? null;
    const overrides: Record<string, PosTokenOverride> = {};
    if (typeof window !== 'undefined') {
      try {
        if (!branch) {
          const suffix = `.${todayISO}`;
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && k.startsWith('growza.pos.queue.') && k.endsWith(suffix)) {
              const raw = window.localStorage.getItem(k);
              if (raw) {
                const parsed = JSON.parse(raw) as Record<string, PosTokenOverride>;
                if (parsed && typeof parsed === 'object') Object.assign(overrides, parsed);
              }
            }
          }
        }
        const primaryRaw = window.localStorage.getItem(posQueueStorageKey(resolvedLoc, todayISO));
        if (primaryRaw) {
          const parsed = JSON.parse(primaryRaw) as Record<string, PosTokenOverride>;
          if (parsed && typeof parsed === 'object') Object.assign(overrides, parsed);
        }
      } catch {
        // Ignore storage errors
      }
    }

    const now = Date.now();
    const tokens: Array<{
      id: string;
      tokenNo: number;
      tokenLabel: string;
      customerName: string;
      channel: string;
      soldAt: string;
      items: number;
      amountMinor?: number;
      elapsedMin: number;
    }> = [];

    todaySorted.forEach((o, idx) => {
      const tokenNo = tokenNoOf.get(o.id) ?? idx + 1;
      const soldMs = Date.parse(o.soldAt) || now;
      const ov = overrides[o.id];
      const recalledMs =
        typeof ov === 'string' && ov.startsWith('preparing:') ? Number(ov.slice(10)) : NaN;
      const effectiveStartMs = Number.isFinite(recalledMs) && recalledMs > 0 ? recalledMs : soldMs;
      const elapsedMin = Math.max(0, Math.round((now - effectiveStartMs) / 60_000));
      // The till's own rule, so the two never disagree: a handover on any device takes it off this card at once.
      const isPreparing =
        queueStateOf({ handedOverAt: o.handedOverAt, paymentPending: o.paymentPending === true, override: ov, elapsedMin }) === 'preparing';
      if (isPreparing) {
        tokens.push({
          id: o.id,
          tokenNo,
          tokenLabel: formatTokenNo(tokenNo),
          customerName: o.who?.name?.trim() || s.noNameCustomer,
          channel: o.channel,
          soldAt: o.soldAt,
          items: o.items,
          amountMinor: o.amountMinor,
          elapsedMin,
        });
      }
    });

    tokens.sort((a, b) => b.elapsedMin - a.elapsedMin || a.tokenNo - b.tokenNo);
    const totalToday = Math.max(data?.today.orders ?? 0, todaySorted.length);
    const boundedInQueue = tokens.length;
    return {
      inQueue: boundedInQueue,
      completedToday: Math.max(0, totalToday - boundedInQueue),
      tokens,
    };
  }, [todayOrderRows, recentOrders, data, branch, branchContext.choice, branchContext.one, fmtDate, queueTick, s.noNameCustomer]);

  const quickLinks =
    tiles.length > 0 ? (
      <Card className="hm-area-links hm-mobile shp-links" title={t.quickLinks}>
        <QuickTiles items={tiles} />
      </Card>
    ) : null;

  return (
    <>
      <HomeHeader
        t={t}
        title={isKitchen ? `${t.greeting(greetingPart)}! 👋` : t.greeting(greetingPart)}
        sub={isKitchen ? s.kitchenSub(businessName) : money ? t.ownerSub(businessName, false) : businessName}
        businessName={businessName}
        locationName={locationName}
        dateLabel={dateLabel}
        simpleDesktop={isKitchen}
        // A shop opens the day's summary from the toolbar beside the range, so the header does not carry a second one.
        onDaySummary={money && isKitchen ? () => setSummaryOpen(true) : undefined}
      />
      <div className={`page-body hm-page hm-fit shp-page${isKitchen ? ' is-kitchen' : ''}`} aria-busy={loading || undefined}>
        {/* Jira GRW-76 — a staff-kind role holder's own "I'm in", first, as a stylist's is; the card draws only where their branch offers it. */}
        {attendanceMonth && timezone ? <CheckInCard today={attendanceMonth.rows.find((r) => r.onDate === attendanceMonth.today) ?? null} timezone={timezone} /> : null}
        {failed || !data ? (
          <Card>
            <CardError t={t} onRetry={() => load(branch)} />
          </Card>
        ) : (
          <>
            {/* Top Toolbar (Desktop Command Center period switch & quick primary actions) */}
            <div className="hm-toolbar shp-desk-toolbar">
              <div className="shp-desk-toolbar-start">
                {money && canReports ? (
                  <Segmented
                    label={s.rangeLabel}
                    value={period}
                    options={[
                      { value: 'last_7_days', label: s.range7d },
                      { value: 'this_month', label: s.rangeMonth },
                      { value: 'last_3_months', label: s.range90d },
                    ]}
                    onChange={(v) => setPeriod(v)}
                  />
                ) : null}
                {/* A shop's Sales card already says today's money; only a kitchen's Home has no such card here. */}
                {isKitchen && money && data.today.takingsMinor !== undefined ? (
                  <span className="shp-live-pill">
                    <i className="shp-live-dot" aria-hidden />
                    <span>{s.liveTodayLabel}:</span>
                    <strong>{rupees(data.today.takingsMinor)}</strong>
                    <span>· {s.orderCount(data.today.orders)}</span>
                  </span>
                ) : null}
              </div>
              <div className="hm-toolbar-end">
                {/*
                  The same button the salon's Home has carried since Jira GRW-306, on the same row, opening the
                  same sheet — a shop's day was the one Home that could not be asked how it went.
                */}
                {money ? (
                  <button type="button" className="hm-toolbar-summary" aria-label={t.daySummary} title={t.daySummary} onClick={() => setSummaryOpen(true)}>
                    <IconDaySummary />
                    <span className="hm-toolbar-summary-label">{t.daySummary}</span>
                  </button>
                ) : null}
                <div className="hm-primary-actions hm-toolbar-actions hm-desktop">
                  {/*
                    The same sheet on a laptop. `.hm-toolbar-summary` above is the PHONE control — it is
                    `display: none` from 861px (styles/83-role-home.css), where the salon's Home opens the sheet
                    from its "Day closed" row instead. A shop's Home has no such row, so the way in here is an
                    action beside the others, in the shape every other action on this row already has.
                  */}
                  {money ? (
                    <button type="button" className="hm-action" onClick={() => setSummaryOpen(true)}>
                      <IconDaySummary />
                      <strong>{t.daySummary}</strong>
                    </button>
                  ) : null}
                  {/* A shop reaches Import orders and Stock from the sidebar; the toolbar keeps only the summary. */}
                  {isKitchen && can('/stock') ? (
                    <a href={`/stock${stockBranch}`} className="hm-action">
                      <IconNavStock />
                      <strong>{t.nav.stock}</strong>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            {/* =====================================================================
                SIMPLE RESTAURANT DESKTOP HOME (from 861px up when isKitchen is true)
               ===================================================================== */}
            {isKitchen ? (
              <div className="rst-desk hm-desktop">
                {/* ROW 1 — 3 Soft Pastel KPI Cards */}
                <div className="rst-kpis">
                  {/* 1. Today's sales */}
                  {money && data.today.takingsMinor !== undefined ? (
                    <div className="rst-kpi rst-kpi-sales">
                      <svg className="rst-kpi-wave" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden>
                        <path d="M0 45 C120 70 260 15 400 38 L400 70 L0 70 Z" fill="rgba(22, 163, 74, 0.08)" />
                      </svg>
                      <div className="rst-kpi-top">
                        <span className="rst-kpi-icon is-sales" aria-hidden>
                          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <ellipse cx="12" cy="6" rx="7" ry="3" />
                            <path d="M5 6v4c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
                            <path d="M5 10v4c0 1.66 3.13 3 7 3s7-1.34 7-3v-4" />
                            <path d="M5 14v4c0 1.66 3.13 3 7 3s7-1.34 7-3v-4" />
                          </svg>
                        </span>
                        <div className="rst-kpi-main">
                          <span className="rst-kpi-label">{s.todaysTakings}</span>
                          <strong className="rst-kpi-value">{rupees(data.today.takingsMinor)}</strong>
                        </div>
                        {salesDeltaPct !== null ? (
                          <div className="rst-kpi-side">
                            <span className={`rst-delta-pill ${deltaTone(salesDeltaPct)}`}>{deltaLabel(salesDeltaPct)}</span>
                            <span className="rst-delta-sub">{s.vsYesterday}</span>
                          </div>
                        ) : null}
                      </div>
                      {data.today.byPaymentMode && data.today.byPaymentMode.length > 0 && data.today.takingsMinor > 0 ? (
                        <div className="rst-kpi-modes" role="group" aria-label={t.howPaid}>
                          {[...data.today.byPaymentMode]
                            .sort((a, b) => b.revenueMinor - a.revenueMinor)
                            .map((m) => (
                              <span key={m.mode} className="rst-kpi-mode">
                                <i className={`rst-mode-dot is-${m.mode}`} aria-hidden />
                                <span>{t.payment[m.mode]}</span>
                                <b>{rupees(m.revenueMinor)}</b>
                              </span>
                            ))}
                          {/* QA 2026-11-06 — what the apps billed, so the split adds up to the takings beside it. */}
                          {data.today.fromAppsMinor ? (
                            <span className="rst-kpi-mode">
                              <i className="rst-mode-dot is-apps" aria-hidden />
                              <span>{t.fromApps}</span>
                              <b>{rupees(data.today.fromAppsMinor)}</b>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {/*
                        Owner, 2026-11-06 — the notes in the till, which the split above cannot say (CashDrawer.tsx).
                        Owner, 2026-11-13 — a shop with a counted shelf does not get the row; the kitchen keeps it.
                      */}
                      {isKitchen && data.today.cashDrawer && (data.today.cashDrawer.takenMinor > 0 || data.today.cashDrawer.refundedMinor > 0) ? (
                        <div className="rst-kpi-modes rst-kpi-drawer">
                          <span className="rst-kpi-mode">
                            <span>{t.cashInDrawer}</span>
                            <b>{rupees(data.today.cashDrawer.inDrawerMinor)}</b>
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 2. Orders */}
                  <a className="rst-kpi rst-kpi-orders" href="/orders">
                    <svg className="rst-kpi-wave" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden>
                      <path d="M0 48 C140 20 270 65 400 35 L400 70 L0 70 Z" fill="rgba(37, 99, 235, 0.07)" />
                    </svg>
                    <span className="rst-kpi-icon is-orders" aria-hidden>
                      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <path d="M16 10a4 4 0 0 1-8 0" />
                      </svg>
                    </span>
                    <div className="rst-kpi-main">
                      <span className="rst-kpi-label">{s.ordersTitle}</span>
                      <strong className="rst-kpi-value">{data.today.orders}</strong>
                    </div>
                    {ordersDeltaPct !== null ? (
                      <div className="rst-kpi-side is-bottom">
                        <span className={`rst-delta-pill ${deltaTone(ordersDeltaPct)}`}>{deltaLabel(ordersDeltaPct)}</span>
                      </div>
                    ) : null}
                  </a>

                  {/* 3. Customers */}
                  <a className="rst-kpi rst-kpi-customers" href="/customers">
                    <svg className="rst-kpi-wave" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden>
                      <path d="M0 42 C130 65 260 22 400 44 L400 70 L0 70 Z" fill="rgba(217, 119, 6, 0.08)" />
                    </svg>
                    <span className="rst-kpi-icon is-customers" aria-hidden>
                      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </span>
                    <div className="rst-kpi-main">
                      <span className="rst-kpi-label">{s.customersCardTitle}</span>
                      <strong className="rst-kpi-value">{customersTotal ?? '—'}</strong>
                    </div>
                  </a>
                </div>

                {/* ROW 2 — What would you like to do? (4 Action Cards) */}
                <section className="rst-actions-section">
                  <h2 className="rst-section-title">{s.whatWouldYouLikeToDo}</h2>
                  <div className="rst-actions-grid">
                    {can('/orders') ? (
                      <a className="rst-action-tile" href="/orders">
                        <span className="rst-action-icon" aria-hidden>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="4" width="14" height="17" rx="2.5" />
                            <path d="M5 9h14" />
                            <circle cx="12" cy="14" r="1.5" />
                          </svg>
                        </span>
                        <strong>{s.viewOrdersAction}</strong>
                      </a>
                    ) : null}
                    {can('/stock') ? (
                      <a className="rst-action-tile" href={`/stock${stockBranch}`}>
                        <span className="rst-action-icon" aria-hidden>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
                            <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
                          </svg>
                        </span>
                        <strong>{s.manageMenuAction}</strong>
                      </a>
                    ) : null}
                    {can('/customers') ? (
                      <a className="rst-action-tile" href="/customers">
                        <span className="rst-action-icon" aria-hidden>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </span>
                        <strong>{s.customersCardTitle}</strong>
                      </a>
                    ) : null}
                    {can('/reports') ? (
                      <a className="rst-action-tile" href="/reports">
                        <span className="rst-action-icon" aria-hidden>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="13" width="3.5" height="7" rx="1" />
                            <rect x="10.25" y="9" width="3.5" height="11" rx="1" />
                            <rect x="16.5" y="5" width="3.5" height="15" rx="1" />
                          </svg>
                        </span>
                        <strong>{t.nav.reports}</strong>
                      </a>
                    ) : null}
                  </div>
                </section>

                {/* ROW 3 — Two-Column Bottom Grid: Recent orders (left) + Needs attention (right) */}
                <div className="rst-bottom-grid">
                  {/* Left: Recent orders */}
                  <section className="rst-panel rst-recent-panel">
                    <div className="rst-panel-head">
                      <h3>{s.recentOrdersTitle}</h3>
                      {can('/orders') ? (
                        <a className="rst-view-all" href="/orders">
                          {s.viewOrders} →
                        </a>
                      ) : null}
                    </div>
                    {recentOrders.length === 0 ? (
                      <p className="hm-empty">{s.noOrdersBody}</p>
                    ) : (
                      <ul className="rst-order-list">
                        {recentOrders.slice(0, 3).map((o) => {
                          // What the order IS — never a guess at it. An app's order is a delivery; anything else rung up here is a counter order.
                          const isDelivery = isDeliveryApp(o.channel);
                          const subLabel = `${channelWord(o.channel)} · ${formatDateTime(o.soldAt)}`;
                          const statusLabel = o.paymentPending ? s.paymentPendingState : stateWord(o.status);
                          const tone = o.paymentPending ? 'amber' : stateTone(o.status);
                          const statusClass = tone === 'green' ? 'is-served' : tone === 'blue' ? 'is-delivery' : tone === 'amber' ? 'is-preparing' : 'is-problem';
                          return (
                            <li key={o.id}>
                              <a className="rst-order-row" href={`/orders/${o.id}`}>
                                <span
                                  className={`rst-order-icon ${isDelivery ? 'is-delivery' : 'is-dinein'}`}
                                  aria-hidden
                                >
                                  {isDelivery ? (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="6.5" cy="17.5" r="2.5" />
                                      <circle cx="17.5" cy="17.5" r="2.5" />
                                      <path d="M15 6h2l3 7v4.5h-2.5" />
                                      <path d="M4 17.5H2.5V12c0-1.5 1.2-2.5 2.5-2.5h5v8" />
                                      <path d="M10 17.5h5" />
                                    </svg>
                                  ) : (
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M3 7v11" />
                                      <path d="M21 7v11" />
                                      <path d="M3 13h4v5" />
                                      <path d="M21 13h-4v5" />
                                      <path d="M7 10h10" />
                                      <path d="M12 10v8" />
                                    </svg>
                                  )}
                                </span>
                                <div className="rst-order-main">
                                  <strong className="rst-order-num">{orderNumber(o)}</strong>
                                  <span className="rst-order-sub">{subLabel}</span>
                                </div>
                                <span className={`rst-status-pill ${statusClass}`}>{statusLabel}</span>
                                <div className="rst-order-right">
                                  {o.amountMinor !== undefined ? (
                                    <strong className="rst-order-amt">{exactRupees(o.amountMinor)}</strong>
                                  ) : null}
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                </div>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  {/* Right: Needs attention — only what is true right now; nothing at all when nothing is. */}
                  <section className="rst-panel rst-attention-panel">
                    <div className="rst-panel-head">
                      <h3>{s.needsAttentionTitle}</h3>
                      {attention.length > 0 ? <span className="rst-att-badge">{s.attentionItemsBadge(attention.length)}</span> : null}
                    </div>
                    {attention.length === 0 ? (
                      <p className="hm-empty">{s.nothingNeedsYou}</p>
                    ) : (
                      <div className="rst-att-stack">
                        {attention.map((item) => (
                          <a key={item.key} className={`rst-att-card ${item.tone === 'amber' ? 'is-amber' : 'is-rose'}`} href={item.href}>
                            <span className={`rst-att-icon ${item.tone === 'amber' ? 'is-amber' : 'is-rose'}`} aria-hidden>
                              {item.key === 'stock' ? (
                                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                  <line x1="12" y1="22.08" x2="12" y2="12" />
                                </svg>
                              ) : (
                                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
                                  <line x1="6" y1="17" x2="18" y2="17" />
                                </svg>
                              )}
                            </span>
                            <div className="rst-att-body">
                              <strong>{item.title}</strong>
                              <span>{item.sub}</span>
                            </div>
                            <svg className="rst-att-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            ) : null}

            {/* =====================================================================
                DESKTOP COMMAND CENTER (4-row Salon-style layout from 861px up)
               ===================================================================== */}
            <div className={`hm-desk-v3 hm-desktop shp-desk-v3${isKitchen ? ' is-kitchen-hidden' : ''}`}>
              {/* ROW 1 — four rich KPI cards; three where there is no shelf (a kitchen), which drops Stock worth. */}
              <div className={`hm-v3-kpis${areas.stock ? '' : ' hm-v3-kpis-3'}`}>
                {/* 1. Takings / Billed Revenue */}
                {money && data.today.takingsMinor !== undefined ? (
                  <section className="hm-v3-kpi hm-v3-kpi-dark">
                    <div className="hm-v3-kpi-head">
                      <span className="hm-v3-kpi-icon hm-v3-icon-dark" aria-hidden>
                        <span className="hm-v3-rupee-glyph">₹</span>
                      </span>
                      {canReports && can('/stock/channels') ? (
                        <a className="hm-v3-kpi-title hm-v3-kpi-title-link" href="/stock/channels">
                          {s.takings}
                        </a>
                      ) : (
                        <span className="hm-v3-kpi-title">{s.todaysTakings}</span>
                      )}
                    </div>
                    <div className="hm-v3-kpi-body">
                      <div className="hm-v3-kpi-main">
                        <div className="hm-v3-kpi-num-row">
                          <strong className="hm-v3-kpi-amount">
                            {rupees(
                              channelData
                                ? Number(channelData.totals.billedMinor)
                                : data.today.takingsMinor,
                            )}
                          </strong>
                        </div>
                        <div className="hm-v3-kpi-delta-row">
                          {channelData?.totals.changePct !== null && channelData?.totals.changePct !== undefined ? (
                            <span className="hm-v3-delta-pill">
                              {channelData.totals.changePct >= 0 ? '↑' : '↓'} {Math.abs(channelData.totals.changePct)}%
                            </span>
                          ) : null}
                          <span className="hm-v3-kpi-vs">
                            {s.today} {rupees(data.today.takingsMinor)} · {s.yesterday} {rupees(data.yesterday.takingsMinor ?? 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* The split by channel says something only once a second channel has sold: "Flipkart ₹0 · Amazon ₹0" is noise. */}
                    {soldElsewhere ? (
                      <div className="hm-v3-kpi-foot hm-v3-split-foot">
                        {channelBreakdown.map((ch) => (
                          <span key={ch.key} className="hm-v3-split-item">
                            {ch.label} <b>{rupees(ch.billed)}</b>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {(() => {
                      const deskModes = channelData?.byPaymentMode ?? data.today.byPaymentMode ?? [];
                      if (deskModes.length === 0) return null;
                      return (
                        <div className="hm-v3-kpi-foot hm-v3-split-foot hm-v3-modes-foot" role="group" aria-label={t.howPaid}>
                          {[...deskModes]
                            .sort((a, b) => b.revenueMinor - a.revenueMinor)
                            .map((m) => (
                              <span key={m.mode} className="hm-v3-split-item hm-v3-mode-item">
                                <i className={`rst-mode-dot is-${m.mode}`} aria-hidden />
                                {t.payment[m.mode]} <b>{rupees(m.revenueMinor)}</b>
                              </span>
                            ))}
                        </div>
                      );
                    })()}
                  </section>
                ) : (
                  <section className="hm-v3-kpi hm-v3-kpi-dark">
                    <div className="hm-v3-kpi-head">
                      <span className="hm-v3-kpi-icon hm-v3-icon-dark" aria-hidden>
                        <IconNavOrders />
                      </span>
                      <span className="hm-v3-kpi-title">{s.ordersTodayLabel}</span>
                    </div>
                    <div className="hm-v3-kpi-body">
                      <div className="hm-v3-kpi-main">
                        <div className="hm-v3-kpi-num-row">
                          <strong className="hm-v3-kpi-amount">{data.today.orders}</strong>
                        </div>
                        <div className="hm-v3-kpi-delta-row">
                          <span className="hm-v3-kpi-vs">
                            {data.today.orders === 0 ? s.noOrdersToday : s.orderCount(data.today.orders)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="hm-v3-kpi-foot hm-v3-split-foot">
                      <span className="hm-v3-split-item">
                        {!ships ? s.yesterday : s.toSendShort} <b>{!ships ? data.yesterday.orders : data.toSend}</b>
                      </span>
                    </div>
                  </section>
                )}

                {/* 2. Orders & Dispatch */}
                <a
                  className="hm-v3-kpi hm-v3-kpi-link hm-v3-kpi-blue"
                  href={data.toSend > 0 ? ordersHref({ status: 'new,packed' }) : '/orders'}
                >
                  <div className="hm-v3-kpi-head">
                    <span className="hm-v3-kpi-icon hm-v3-icon-blue">
                      <IconNavOrders />
                    </span>
                    <span className="hm-v3-kpi-title">{s.ordersTitle}</span>
                  </div>
                  <div className="hm-v3-kpi-body">
                    <div className="hm-v3-kpi-main">
                      <div className="hm-v3-kpi-num-row">
                        <strong className="hm-v3-kpi-value">
                          {channelData ? channelData.totals.orders : data.today.orders}
                        </strong>
                      </div>
                      <div className="hm-v3-kpi-delta-row">
                        <span className="hm-v3-kpi-sub">
                          {!ships ? s.ordersInPeriod : data.toSend > 0 ? `${s.toSend(data.toSend)} · ${s.needsDispatchSub}` : s.allSentSub}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hm-v3-prog-track" aria-hidden>
                    {(() => {
                      const tot = Math.max(1, (channelData?.totals.orders ?? data.today.orders) + data.toSend);
                      const sentShare = Math.max(10, Math.round(((tot - data.toSend - totalReturnedOrders) / tot) * 100));
                      const waitShare = Math.round((data.toSend / tot) * 100);
                      const retShare = Math.round((totalReturnedOrders / tot) * 100);
                      return (
                        <>
                          <span className="is-deep" style={{ width: `${sentShare}%` }} />
                          <span className="is-amber" style={{ width: `${waitShare}%` }} />
                          <span className="is-green" style={{ width: `${retShare}%` }} />
                        </>
                      );
                    })()}
                  </div>
                  <div className="hm-v3-kpi-foot hm-v3-split-foot">
                    <span className="hm-v3-split-item">
                      {s.today} <b>{data.today.orders}</b>
                    </span>
                    <span className="hm-v3-split-item">
                      {!ships ? s.yesterday : s.toSendShort} <b>{!ships ? data.yesterday.orders : data.toSend}</b>
                    </span>
                    <span className="hm-v3-split-item">
                      {s.returnedShort} <b>{totalReturnedOrders}</b>
                    </span>
                  </div>
                </a>

                {/* 3. Units / Dishes Sold & Top Seller */}
                <a
                  className="hm-v3-kpi hm-v3-kpi-link hm-v3-kpi-amber"
                  href={canReports && can('/stock/sellers') ? '/stock/sellers' : '/orders'}
                >
                  <div className="hm-v3-kpi-head">
                    <span className="hm-v3-kpi-icon hm-v3-icon-amber">
                      <IconProducts />
                    </span>
                    <span className="hm-v3-kpi-title">{isKitchen ? s.dishesSoldTitle : s.unitsSoldTitle}</span>
                  </div>
                  <div className="hm-v3-kpi-body">
                    <div className="hm-v3-kpi-main">
                      <div className="hm-v3-kpi-num-row">
                        <strong className="hm-v3-kpi-value">{sellersData ? sellersData.totals.units : data.today.orders}</strong>
                      </div>
                      <div className="hm-v3-kpi-delta-row">
                        <span className="hm-v3-kpi-sub">
                          {sellersData
                            ? areas.stock
                              ? s.acrossSizesOnly(sellersData.totals.sizes)
                              : s.acrossItems(rupees(Number(sellersData.totals.valueMinor)), sellersData.totals.sizes)
                            : periodLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hm-v3-kpi-foot hm-v3-prod-foot">
                    <span className="hm-v3-prod-inline">
                      <span>{isKitchen ? s.topDishLabel : s.topSellerLabel}</span>{' '}
                      <b>
                        {topSeller
                          ? `${topSeller.name}${topSeller.sizeLabel ? ` (${topSeller.sizeLabel})` : ''} · ${topSeller.units}`
                          : '—'}
                      </b>
                    </span>
                  </div>
                </a>

                {/* 4. Stock Worth & Shelf Health — a count, so a kitchen has none of it. */}
                {!areas.stock ? null : (
                <a
                  className="hm-v3-kpi hm-v3-kpi-link hm-v3-kpi-purple"
                  href={canReports && can('/stock/report') ? '/stock/report' : `/stock${stockBranch}`}
                >
                  <div className="hm-v3-kpi-head">
                    <span className="hm-v3-kpi-icon hm-v3-icon-green">
                      <IconNavStock />
                    </span>
                    <span className="hm-v3-kpi-title">{s.stockWorthTitle}</span>
                  </div>
                  <div className="hm-v3-kpi-body">
                    <div className="hm-v3-kpi-main">
                      <div className="hm-v3-kpi-num-row">
                        <strong className="hm-v3-kpi-value">
                          {stockData
                            ? rupees(Number(stockData.totals.valueMinor))
                            : data.running.counted
                              ? data.running.total
                              : '—'}
                        </strong>
                      </div>
                      <div className="hm-v3-kpi-delta-row">
                        <span className="hm-v3-kpi-sub">
                          {stockData
                            ? s.stylesAndSizes(stockData.totals.styles, stockData.totals.sizes)
                            : data.running.counted
                              ? s.sizesLowSub(data.running.total)
                              : s.notCounted}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="hm-v3-kpi-foot hm-v3-split-foot">
                    <span className="hm-v3-split-item">
                      {s.onShelfShort} <b>{stockData ? stockData.totals.units : '—'}</b>
                    </span>
                    <span className="hm-v3-split-item">
                      {s.lowStockShort} <b>{data.running.counted ? data.running.total : '—'}</b>
                    </span>
                  </div>
                </a>
                )}
              </div>

              {/* ROW 2 — Sales trend, where the money came from (once there is more than the counter), and what needs attention */}
              <div className={`hm-v3-mid${money && canReports && soldElsewhere ? '' : attentionReachable ? ' hm-v3-mid-two' : ' hm-v3-mid-one'}`}>
                {/* 1. Sales Trend SVG Line + Bar Chart */}
                <section className="hm-v3-card hm-v3-trend-card">
                  <div className="hm-v3-card-head">
                    <div className="shp-trend-head-main">
                      <h2>{s.salesTrendTitle}</h2>
                      {trendChart.totalMinor > 0 ? (
                        <div className="shp-trend-stats">
                          <span>
                            {s.dailyAvgLabel}: <strong>{rupees(trendChart.dailyAvgMinor)}</strong>
                          </span>
                          {trendChart.peakDay ? (
                            <span>
                              {s.peakDayLabel}: <strong>{trendChart.peakDay.dateShort} ({rupees(trendChart.peakDay.revenueMinor)})</strong>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {trendChart.points.length === 0 ? (
                    <p className="hm-empty">{s.noSalesInRange}</p>
                  ) : (
                    <div className="hm-v3-chart-box">
                      <div className="hm-v3-yaxis" aria-hidden>
                        {trendChart.ticks.map((lbl, idx) => (
                          <span key={idx}>{lbl}</span>
                        ))}
                      </div>
                      <div className="hm-v3-chart-plot">
                        <div className="hm-v3-grid-lines" aria-hidden>
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                        <svg className="hm-v3-trend-line-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                          {trendChart.areaPoints ? (
                            <polygon className="shp-trend-area" points={trendChart.areaPoints} />
                          ) : null}
                          <polyline className="hm-v3-trend-poly" points={trendChart.polyPoints} vectorEffect="non-scaling-stroke" />
                        </svg>
                        <div
                          className="hm-v3-bars"
                          style={{ gridTemplateColumns: `repeat(${trendChart.points.length}, minmax(0, 1fr))` }}
                        >
                          {trendChart.points.map((d) => (
                            <div key={d.key} className={`hm-v3-bar-col ${d.isPeak ? 'is-peak' : ''} ${d.revenueMinor === 0 ? 'is-zero' : ''}`}>
                              <div className="hm-v3-bar-track">
                                {d.isPeak ? (
                                  <span className="hm-v3-bar-tip" style={{ bottom: `calc(${d.pct}% + 10px)` }}>
                                    {rupees(d.revenueMinor)}
                                  </span>
                                ) : null}
                                {d.revenueMinor > 0 ? (
                                  <span className="hm-v3-bar-dot" style={{ bottom: `calc(${d.pct}% - 4px)` }} aria-hidden />
                                ) : null}
                                <span className="hm-v3-bar-fill" style={{ height: `${d.pct}%` }} />
                              </div>
                              <span className="hm-v3-bar-day">{d.dateShort}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* 2. Where Money Came From — drawn only once a channel besides the counter has sold. */}
                {money && canReports && soldElsewhere ? (
                  <section className="hm-v3-card shp-channels-card">
                    <div className="hm-v3-card-head">
                      <h2>{s.channelsLink}</h2>
                      {can('/stock/channels') ? (
                        <a className="hm-v3-head-link" href="/stock/channels">
                          {s.viewOrders} →
                        </a>
                      ) : null}
                    </div>
                    <ul className="hm-v3-srv-rows shp-channel-rows">
                      {channelBreakdown.map((ch) => (
                        <li key={ch.key} className="shp-channel-row">
                          <div className="shp-channel-row-top">
                            <span className={`ord-chan-badge ord-chan-${ch.key}`}>{ch.label}</span>
                            <span className="shp-channel-meta">
                              { s.orderCount(ch.orders) }
                              { ch.avg !== null ? ` · ${s.avgOrderShort(rupees(Math.round(ch.avg / 100) * 100))}` : '' }
                            </span>
                            <strong className="hm-v3-srv-rev">{rupees(ch.billed)}</strong>
                          </div>
                          <div className="hm-v3-srv-bar">
                            <span style={{ width: `${ch.sharePct}%` }} />
                          </div>
                        </li>
                      ))}
                      {isKitchen && channelBreakdown.length === 1 && channelData ? (
                        <>
                          <li className="shp-channel-row shp-insight-row">
                            <div className="shp-channel-row-top">
                              <span className="shp-insight-badge">{s.dishesSoldShort}</span>
                              <span className="shp-channel-meta">
                                {sellersData && channelData.totals.orders > 0
                                  ? s.itemsPerOrder((sellersData.totals.units / channelData.totals.orders).toFixed(1))
                                  : s.orderCount(channelData.totals.orders)}
                              </span>
                              <strong className="hm-v3-srv-rev">
                                {sellersData ? sellersData.totals.units : '—'}
                              </strong>
                            </div>
                          </li>
                          <li className="shp-channel-row shp-insight-row">
                            <div className="shp-channel-row-top">
                              <span className="shp-insight-badge is-mint">{s.today}</span>
                              <span className="shp-channel-meta">
                                {s.yesterday} {rupees(data.yesterday.takingsMinor ?? 0)}
                              </span>
                              <strong className="hm-v3-srv-rev">{rupees(data.today.takingsMinor ?? 0)}</strong>
                            </div>
                          </li>
                        </>
                      ) : null}
                    </ul>
                  </section>
                ) : null}

                {/*
                  Needs attention — the one list of what is waiting on the owner: app orders still to send, orders that came
                  back, and the shelf running out. A count that is zero is not drawn; when every one is, the card says so.
                */}
                {attentionReachable ? (
                  <section className="hm-v3-card hm-v3-products-card hm-v3-prod-attention shp-needs-card">
                    <div className="hm-v3-card-head">
                      <h2>
                        {s.needsAttentionTitle} {attentionCount > 0 ? <span className="hm-v3-count">({attentionCount})</span> : null}
                      </h2>
                      {areas.stock && can('/stock') ? (
                        <a className="hm-v3-head-link" href={`/stock${stockBranch}`}>
                          {s.viewOrders} →
                        </a>
                      ) : null}
                    </div>
                    {attentionCount === 0 ? (
                      <p className="hm-empty">{areas.stock && !data.running.counted ? s.notCounted : s.nothingNeedsYou}</p>
                    ) : (
                      <>
                        <div className="hm-v3-prod-att-summary">
                          {attentionChips.map((c) =>
                            c.href ? (
                              <a key={c.key} className={`hm-v3-prod-att-chip is-${c.tone}`} href={c.href}>
                                <strong>{c.n}</strong>
                                <span>{c.label}</span>
                              </a>
                            ) : (
                              <span key={c.key} className={`hm-v3-prod-att-chip is-${c.tone}`}>
                                <strong>{c.n}</strong>
                                <span>{c.label}</span>
                              </span>
                            ),
                          )}
                        </div>
                        {areas.stock && can('/stock') && data.running.counted && data.running.items.length > 0 ? (
                          <ul className="hm-v3-srv-rows hm-v3-prod-att-rows">
                            {data.running.items.slice(0, 4).map((r) => {
                              const isOut = r.left <= 0;
                              return (
                                <li key={`${r.productId}-${r.size ?? ''}`}>
                                  <a className="hm-v3-srv-row hm-v3-prod-att-row" href={`/stock${stockBranch}`}>
                                    <Avatar name={r.name} id={r.productId} size={30} />
                                    <div className="hm-v3-srv-main">
                                      <strong className="hm-v3-srv-name">{r.name}</strong>
                                      <span className="hm-v3-prod-att-sub">
                                        {r.size ? s.sizeWord(r.size) : t.nav.stock}
                                        {r.branch ? ` · ${r.branch}` : ''}
                                      </span>
                                    </div>
                                    <span className={`hm-pill hm-pill-${isOut ? 'rose' : 'amber'}`}>{s.left(r.left)}</span>
                                  </a>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </section>
                ) : null}
              </div>

              {/* ROW 3 — Top sellers, the width of the page. */}
              <section className="hm-v3-card hm-v3-staff-card">
                <div className="hm-v3-card-head">
                  <h2>
                    {s.whatSellsLink}{' '}
                    {sellersData ? <span className="hm-v3-count">({sellersData.totals.sizes})</span> : null}
                  </h2>
                  {canReports && can('/stock/sellers') ? (
                    <a className="hm-v3-head-link" href="/stock/sellers">
                      {s.viewOrders} →
                    </a>
                  ) : null}
                </div>
                {!sellersData || sellersData.rows.length === 0 ? (
                  <p className="hm-empty">{s.noSalesInRange}</p>
                ) : (
                  <ul className="hm-v3-srv-rows hm-v3-prod-att-rows">
                    {(() => {
                      const maxUnits = Math.max(1, ...sellersData.rows.slice(0, 5).map((r) => r.units));
                      return sellersData.rows.slice(0, 5).map((item, idx) => {
                        const share = Math.max(10, Math.round((item.units / maxUnits) * 100));
                        return (
                          <li key={item.id}>
                            <a
                              className="hm-v3-srv-row hm-v3-prod-att-row shp-seller-row"
                              href={canReports && can('/stock/sellers') ? '/stock/sellers' : `/stock${stockBranch}`}
                            >
                              <span className={`hm-v3-srv-rank ${idx === 0 ? 'is-top' : ''}`}>{idx + 1}</span>
                              <Avatar name={item.name} id={item.productId} size={30} />
                              <div className="hm-v3-srv-main">
                                <div className="shp-seller-top">
                                  <strong className="hm-v3-srv-name">
                                    {item.name}
                                    {item.sizeLabel ? ` (${item.sizeLabel})` : ''}
                                  </strong>
                                  <span className="shp-seller-val">{rupees(Number(item.valueMinor))}</span>
                                </div>
                                <div className="hm-v3-srv-bar">
                                  <span style={{ width: `${share}%` }} />
                                </div>
                              </div>
                              <span className="hm-pill hm-pill-green">{s.soldCountPill(item.units)}</span>
                            </a>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                )}
              </section>

              {/* ROW 4 — Recent Orders (Full-Width Table Card) */}
              <section className="hm-v3-card hm-v3-recent-card">
                <div className="hm-v3-card-head">
                  <h2>
                    {s.recentOrdersTitle}{' '}
                    <span className="hm-v3-count">({recentOrders.length})</span>
                  </h2>
                  {can('/orders') ? (
                    <a className="hm-v3-head-link" href="/orders">
                      {s.viewOrders} →
                    </a>
                  ) : null}
                </div>
                {recentOrders.length === 0 ? (
                  <p className="hm-empty">{s.noOrdersBody}</p>
                ) : (
                  <div className="hm-v3-recent-wrap">
                    <table className="hm-v3-recent-table">
                      <thead>
                        <tr>
                          <th>{s.colWhen}</th>
                          <th>{s.colCustomer}</th>
                          <th>{s.colChannel}</th>
                          <th>{s.colItems}</th>
                          {money ? <th>{s.colAmount}</th> : null}
                          <th>{s.colStatus}</th>
                          <th>{s.colActions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentOrders.map((o) => {
                          const customerName = o.who?.name?.trim() || s.noNameCustomer;
                          return (
                            <tr key={o.id}>
                              <td className="hm-v3-td-time">
                                <strong>{formatDateTime(o.soldAt)}</strong>
                              </td>
                              <td className="hm-v3-td-client">
                                <div className="hm-v3-person">
                                  <Avatar name={customerName} id={o.id} size={28} />
                                  <div className="hm-v3-person-meta">
                                    <strong>{customerName}</strong>
                                    <span>{orderNumber(o)}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`ord-chan-badge ord-chan-${o.channel}`}>
                                  {channelWord(o.channel)}
                                </span>
                              </td>
                              <td>{s.itemCountShort(o.items)}</td>
                              {money ? (
                                <td className="hm-v3-td-amount">
                                  <strong>{o.amountMinor !== undefined ? rupees(o.amountMinor) : '—'}</strong>
                                </td>
                              ) : null}
                              <td>
                                <span className={`hm-pill hm-pill-${stateTone(o.status)}`}>
                                  {stateWord(o.status)}
                                </span>
                              </td>
                              <td>
                                <a className="hm-v3-row-btn" href={`/orders/${o.id}`}>
                                  {s.openOrderAction}
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            {/* =====================================================================
                PHONE MONEY (<861px) — the filter and the hero, in a block of their own
                so Quick links can sit between them and the lists without being moved
                inside this branch. Hidden from 861px up, exactly as the stack below is.
               ===================================================================== */}
            <div className="shp-phone-money">
                {/*
                  The money, as the salon's Home states it: one dark hero that anchors the screen,
                  not a white card the same weight as every other. Written with the salon's own class
                  names (`hm-hero`, `hm-hero-amount`, `hm-hero-stats`, `hm-line-foot`) so it inherits
                  that skin exactly rather than a second one drifting beside it — a shop's figures are
                  different from a salon's, the way they are shown should not be.
                */}
                {/*
                  Jira GRW-643 — the filter sits ABOVE the hero, not inside it: it governs the money, the two
                  figures under it and the top seller, and a control that governs a card is not part of one.
                  Only an owner whose figures it can actually move is offered it (`kind === 'none'` and the
                  unchanged `'today'` hero have nothing to filter).
                */}
                {phoneFigures.kind === 'range' || phoneFigures.kind === 'busy' || phoneFigures.kind === 'failed' ? (
                  <div className="shp-period hm-toolbar">
                    <Segmented
                      value={phonePeriod}
                      options={phonePeriodOptions}
                      onChange={setPhonePeriod}
                      label={s.periodLabel}
                      className="shp-period-seg"
                    />
                    <button
                      type="button"
                      className="hm-toolbar-summary shp-period-summary"
                      aria-label={t.daySummary}
                      title={t.daySummary}
                      onClick={() => setSummaryOpen(true)}
                    >
                      <IconDaySummary />
                      <span className="hm-toolbar-summary-label">{t.daySummary}</span>
                    </button>
                  </div>
                ) : null}

                {phoneFigures.kind === 'none' ? null : (
                  <section className="hm-hero shp-hero" aria-busy={phoneFigures.kind === 'busy' || (phoneFigures.kind === 'range' && phoneFigures.busy)}>
                    <div className="hm-hero-top">
                      <span className="hm-eyebrow">{phoneFigures.kind === 'today' ? s.takings : phonePeriodWord}</span>
                      {canReports && can('/stock/channels') ? (
                        <a className="shp-hero-link" href="/stock/channels">
                          {s.channelsLink} →
                        </a>
                      ) : null}
                      {payMenu && (phoneFigures.kind === 'today' || phoneFigures.kind === 'range') ? (
                        <div ref={payMenuRef} className="hm-menu hm-pay-menu" role="dialog" aria-label={t.howPaid}>
                          <div className="hm-pay-menu-head">
                            <strong>{t.howPaid}</strong>
                            <span>{rupees(phoneFigures.takingsMinor)}</span>
                          </div>
                          <PaymentBar t={t} slices={phoneFigures.byPaymentMode} total={phoneFigures.takingsMinor} variant="list" />
                        </div>
                      ) : null}
                    </div>

                    {phoneFigures.kind === 'busy' ? (
                      // A shaped block, not a spinner: the hero keeps its height so nothing below it jumps when the figure lands.
                      <div className="shp-hero-skeleton" role="status" aria-live="polite">
                        <span className="sr-only">{s.loadingFigures}</span>
                      </div>
                    ) : phoneFigures.kind === 'failed' ? (
                      <div className="shp-hero-failed" role="status">
                        <span>{t.couldNotLoad}</span>
                        <button type="button" className="shp-hero-pill" onClick={() => setPhoneRetry((n) => n + 1)}>
                          {t.retry}
                        </button>
                      </div>
                    ) : phoneFigures.kind === 'today' || phoneFigures.kind === 'range' ? (
                      <>
                        <div className="hm-hero-amount">{rupees(phoneFigures.takingsMinor)}</div>
                        {/*
                          A window that sold nothing says so in words. "₹0" with "0 orders" under it is true
                          and reads as a screen that failed to load; the sentence reads as an answer.
                        */}
                        {phoneFigures.kind === 'range' && phoneFigures.orders === 0 && phoneFigures.takingsMinor === 0 ? (
                          <>
                            <p className="shp-hero-none">{s.noSalesYet}</p>
                            {phonePeriod === 'today' && (data.yesterday.takingsMinor ?? 0) > 0 ? (
                              <div className="hm-hero-stats">
                                <span>
                                  {s.yesterday} <strong>{rupees(data.yesterday.takingsMinor ?? 0)}</strong> · {s.orderCount(data.yesterday.orders)}
                                </span>
                              </div>
                            ) : null}
                          </>
                        ) : (
                        <div className="hm-hero-stats">
                          <span>
                            <strong>{phoneFigures.orders}</strong> {s.orderWord(phoneFigures.orders)}
                          </span>
                          {/*
                            `orders` above is what was BILLED. An order returned in full was not, and the
                            Orders card below counts it, so without this the two cards answer one question
                            twice and differently. It is drawn only when there is one to draw.
                          */}
                          {phoneFigures.kind === 'range' && phoneFigures.returnedOrders > 0 ? (
                            <span>{s.cameBack(phoneFigures.returnedOrders)}</span>
                          ) : null}
                          {phoneFigures.kind === 'today' ? (
                            <span>
                              {s.yesterday} <strong>{rupees(phoneFigures.previousMinor)}</strong>
                            </span>
                          ) : phoneFigures.changePct !== null && phoneFigures.changePct !== undefined ? (
                            // Never colour alone: the arrow and the sign carry it for anyone who cannot tell green from red.
                            <span className={`shp-delta ${deltaTone(phoneFigures.changePct)}`}>
                              {deltaLabel(phoneFigures.changePct)} {s.vsPrevious}
                            </span>
                          ) : null}
                          {/*
                            The average order, the one figure of the mock-up's KPI row that is not already on
                            this screen. It sits in the hero's own stats line rather than in a strip below it:
                            a strip would have had to carry the order count too to look like a row, and that
                            count is printed two lines above — which is what the strip removed on 2026-10-23
                            was doing, and why `retail-ui-redesign.test.ts` holds it gone.
                          */}
                          {phoneFigures.kind === 'range' && phoneFigures.avgMinor !== null ? (
                            <span>{s.avgOrderShort(rupees(phoneFigures.avgMinor))}</span>
                          ) : null}
                        </div>
                        )}
                        {(phoneFigures.byPaymentMode.length > 0 || (phoneFigures.fromAppsMinor ?? 0) > 0) && phoneFigures.takingsMinor > 0 ? (
                          <PaymentLine
                            t={t}
                            slices={phoneFigures.byPaymentMode}
                            total={phoneFigures.takingsMinor}
                            onMore={() => setPayMenu(true)}
                            appsMinor={phoneFigures.fromAppsMinor}
                          />
                        ) : null}
                        {isKitchen && (phoneFigures.kind === 'today' || phoneFigures.kind === 'range') ? <CashDrawerLine t={t} cashDrawer={phoneFigures.cashDrawer} /> : null}
                        {phoneSpark.length > 0 ? (
                          // Decoration would be a lie here, so it is drawn only from the window's own daily totals.
                          <div className="shp-spark" aria-hidden="true">
                            {phoneSpark.map((b) => (
                              <i key={b.key} style={{ height: `${b.pct}%` }} />
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {canReports && can('/stock/report') ? (
                      <div className="shp-hero-links">
                        <a className="shp-hero-pill" href="/stock/report">
                          {s.stockReportLink} →
                        </a>
                      </div>
                    ) : null}
                  </section>
                )}

            </div>
          </>
        )}

        {/*
          Quick links on a phone. Owner, 2026-11-13 — a shop with a counted shelf has them straight under the money:
          the figure, then the doors, then what needs the owner. The kitchen keeps them last (below). Outside the
          branch a failed read replaces, so they stay when it does. `.hm-mobile`, so a laptop never draws them.
        */}
        {areas.stock ? quickLinks : null}

        {failed || !data ? null : (
            <div className="shp-mobile-stack">
              {/*
                Owner, 2026-11-13 — a shop's phone Home is a summary, never a list: the lists live one tap away behind
                Orders and Stock. After the money and the doors: what needs the owner, what sells, who came in. A
                kitchen's stack below is untouched.
              */}
              {!areas.stock ? null : (
                <>
                  {attentionReachable ? (
                    <Card
                      title={
                        <>
                          {s.needsAttentionTitle}
                          {phoneAttention.length > 0 ? <span className="shp-card-count"> ({phoneAttention.reduce((n, c) => n + c.n, 0)})</span> : null}
                        </>
                      }
                      action={
                        data.running.counted && canReports && can('/stock/order') ? (
                          <a className="shp-link" href="/stock/order">
                            {s.reorderListLabel}
                          </a>
                        ) : undefined
                      }
                    >
                      {!data.running.counted ? (
                        <div className="shp-empty">
                          <span>{s.notCounted}</span>
                          {can('/stock') ? (
                            <a className="btn shp-cta" href="/stock">
                              {s.countStock}
                            </a>
                          ) : null}
                        </div>
                      ) : phoneAttention.length === 0 ? (
                        <p className="shp-plain">{s.nothingNeedsYou}</p>
                      ) : (
                        <ul className="shp-attn">
                          {phoneAttention.map((c) => {
                            const inner = (
                              <>
                                <span className="shp-attn-label">{c.label}</span>
                                <span className={`shp-running-left ${c.tone}`}>{c.n}</span>
                                {c.href ? (
                                  <span className="shp-attn-chev" aria-hidden>
                                    <IconChevronRight />
                                  </span>
                                ) : null}
                              </>
                            );
                            return (
                              <li key={c.key}>
                                {c.href ? (
                                  <a className="shp-attn-row" href={c.href}>
                                    {inner}
                                  </a>
                                ) : (
                                  <span className="shp-attn-row">{inner}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </Card>
                  ) : null}

                  {canReports && can('/stock/sellers') ? (
                    <Card
                      title={s.whatSellsLink}
                      action={
                        <a className="shp-link" href="/stock/sellers">
                          {s.viewOrders}
                        </a>
                      }
                    >
                      {(phoneSellers?.rows?.length ?? 0) === 0 ? (
                        <p className="shp-plain">{s.noSalesInRange}</p>
                      ) : (
                        <ul className="shp-phone-sellers">
                          {(() => {
                            const rows = phoneSellers?.rows ?? [];
                            const maxUnits = Math.max(1, ...rows.map((r) => r.units));
                            return rows.slice(0, 3).map((item, idx) => {
                              const share = Math.max(10, Math.round((item.units / maxUnits) * 100));
                              return (
                                <li key={item.id}>
                                  <a className="shp-phone-seller-row" href="/stock/sellers">
                                    <span className={`hm-v3-srv-rank ${idx === 0 ? 'is-top' : ''}`}>{idx + 1}</span>
                                    <Avatar name={item.name} id={item.productId} size={32} />
                                    <span className="shp-phone-seller-main">
                                      <span className="shp-phone-seller-top">
                                        <strong className="shp-phone-seller-name">
                                          {item.name}
                                          {item.sizeLabel ? ` (${item.sizeLabel})` : ''}
                                        </strong>
                                        <span className="shp-seller-val">{rupees(Number(item.valueMinor))}</span>
                                      </span>
                                      <span className="hm-v3-srv-bar">
                                        <span style={{ width: `${share}%` }} />
                                      </span>
                                    </span>
                                    <span className="shp-recent-state is-green">{s.soldCountPill(item.units)}</span>
                                  </a>
                                </li>
                              );
                            });
                          })()}
                        </ul>
                      )}
                    </Card>
                  ) : null}

                  {can('/customers') ? (
                    <Card
                      title={s.customersTitle}
                      action={
                        <a className="shp-link" href="/customers">
                          {s.viewOrders}
                        </a>
                      }
                    >
                      {/* Review 2026-11-13 — a zero is a figure, not an empty state: nothing is said while the reads are in flight. */}
                      {(
                        <div className="shp-cust">
                          <a className="shp-cust-figure" href="/customers">
                            <strong>{customersToday}</strong>
                            <span>{s.customersTodayLabel}</span>
                          </a>
                          {customerStats ? (
                            <a className="shp-cust-figure" href="/customers?segment=new">
                              <strong>{customerStats.newThisMonth}</strong>
                              <span>{s.newThisMonthLabel}</span>
                            </a>
                          ) : null}
                        </div>
                      )}
                    </Card>
                  ) : null}
                </>
              )}
              <div className="shp-col-stack">
                {/*
                  The order queue is a kitchen's (POS, 35a76ea5: no Queue on a salon's or a shop's till). This card still
                  drew it for a shop: a football sold and paid at the counter sat in "Queue" as "Preparing" (sports-shop
                  QA, 13 Nov 2026). A shop keeps the card only for what it says to a shop — the first-order invite, and
                  the app orders still to send — under the shop's own word for orders.
                */}
                {isKitchen || !data.anyOrders ? (
                <Card
                  title={isKitchen ? s.queueTitle : s.ordersTitle}
                  action={
                    data.anyOrders && isKitchen && can('/pos') ? (
                      <a className="shp-link" href="/pos?mode=queue">
                        {s.openQueue}
                      </a>
                    ) : data.anyOrders && can('/orders') ? (
                      <a className="shp-link" href="/orders">
                        {s.viewOrders}
                      </a>
                    ) : undefined
                  }
                >
                  {data.anyOrders ? (
                    <>
                      <div className="shp-orders-row">
                        {isKitchen ? (
                        <div className="shp-orders-summary">
                          <p className="shp-orders">
                            <strong>{queueStats.inQueue}</strong>
                            <span>{queueStats.inQueue === 0 ? s.noQueueNow : s.inQueueNow}</span>
                          </p>
                          <span className="shp-orders-yesterday">
                            {s.completedToday}: <b>{queueStats.completedToday}</b>
                          </span>
                        </div>
                        ) : null}
                        {/*
                          Jira GRW-614 (FR-06) — the work waiting. It opens the Orders list already filtered to exactly the states
                          this count is of (`new,packed`), so the number on Home and the rows behind it cannot disagree. Absent
                          when nothing is waiting: a "0 to send" is a line of noise on the screen opened most often.
                        */}
                        {isKitchen && data.toSend > 0 ? (
                          <a className="shp-link shp-tosend" href={ordersHref({ status: 'new,packed' })}>
                            {s.toSend(data.toSend)}
                          </a>
                        ) : null}
                      </div>
                      {isKitchen && queueStats.tokens.length > 0 ? (
                        <ul className="shp-recent">
                          {queueStats.tokens.map((tk) => (
                            <li key={tk.id}>
                              <a
                                className="shp-recent-row"
                                href={
                                  isKitchen && can('/pos')
                                    ? `/pos?mode=queue&token=${encodeURIComponent(tk.id)}`
                                    : `/orders/${encodeURIComponent(tk.id)}`
                                }
                              >
                                <span className="shp-recent-person">
                                  <Avatar name={tk.customerName} id={tk.id} size={36} />
                                  <span className="shp-recent-main">
                                    <span className="shp-recent-name">
                                      <strong>{tk.tokenLabel}</strong> · {tk.customerName}
                                    </span>
                                    <span className="shp-recent-meta">
                                      {channelWord(tk.channel)} · {s.itemCountShort(tk.items)} · {s.minAgo(tk.elapsedMin)}
                                    </span>
                                  </span>
                                </span>
                                <span className="shp-recent-end">
                                  {tk.amountMinor === undefined ? null : (
                                    <span className="shp-recent-amount">{rupees(tk.amountMinor)}</span>
                                  )}
                                  <span className="shp-recent-state is-amber">{s.statePreparing}</span>
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <div className="shp-empty">
                      <strong>{s.noOrdersTitle}</strong>
                      {/* A shelf nobody has counted has nothing to sell, so the first step is the count (below), not the till. */}
                      {/* A shelf nobody counted cannot sell; a kitchen has no shelf, so its first step IS the till. */}
                      <span>{data.running.counted || !areas.stock ? s.noOrdersBody : s.countFirst}</span>
                      {(data.running.counted || !areas.stock) && can('/pos') ? (
                        <a className="btn btn-primary shp-cta" href="/pos">
                          {t.nav.pos}
                        </a>
                      ) : null}
                    </div>
                  )}
                </Card>
                ) : null}
              </div>

              {/*
                Jira GRW-643 — Recent orders, the one card on this phone screen whose rows were already being
                read and thrown away: the command center has listed them since GRW-614, below 861px nothing did.
                Each row says what the Orders list says — its code, its channel, its state and its money — and
                the state is a WORD, never a colour on its own. Money is omitted per row when the API omits it
                (a front desk without the sales tab), the same rule the Orders list follows.
               */}
              {isKitchen && can('/orders') && data.anyOrders && recentOrders.length > 0 ? (
                <Card
                  title={s.recentOrdersTitle}
                  action={
                    <a className="shp-link" href="/orders">
                      {s.viewOrders}
                    </a>
                  }
                >
                  <ul className="shp-recent">
                    {recentOrders.slice(0, 4).map((o) => {
                      const customerName = o.who?.name?.trim() || s.noNameCustomer;
                      return (
                        <li key={o.id}>
                          <a className="shp-recent-row" href={`/orders/${encodeURIComponent(o.id)}`}>
                            <span className="shp-recent-person">
                              <Avatar name={customerName} id={o.id} size={36} />
                              <span className="shp-recent-main">
                                <span className="shp-recent-name">{customerName}</span>
                                <span className="shp-recent-meta">
                                  <span className="shp-recent-code">{orderNumber(o)}</span> · {channelWord(o.channel)} · {formatShortDate(o.soldAt)} · {s.itemCountShort(o.items)}
                                </span>
                              </span>
                            </span>
                            <span className="shp-recent-end">
                              {o.amountMinor === undefined ? null : <span className="shp-recent-amount">{rupees(o.amountMinor)}</span>}
                              <span className={`shp-recent-state is-${stateTone(o.status)}`}>{stateWord(o.status)}</span>
                            </span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ) : null}

              {/*
                Jira GRW-611 review — "View all" opens the SHELF, not its `low` filter. That filter answers the Stock
                screen's question per style (a sized style's count is the sum of its sizes) and this list is per size,
                so the filter could hold none of the rows just listed: a uniform with ten sizes at one each counts as
                twenty in stock. The shelf holds every one of them. A per-size low filter is Jira GRW-591's.
              */}
              {isKitchen && canReports && can('/stock/sellers') && (phoneSellers?.rows?.length ?? 0) > 0 ? (
                <Card
                  title={s.whatSellsLink}
                  action={
                    <a className="shp-link" href="/stock/sellers">
                      {s.viewOrders}
                    </a>
                  }
                >
                  <ul className="shp-phone-sellers">
                    {(() => {
                      const rows = phoneSellers?.rows ?? [];
                      const maxUnits = Math.max(1, ...rows.map((r) => r.units));
                      return rows.slice(0, 4).map((item, idx) => {
                        const share = Math.max(10, Math.round((item.units / maxUnits) * 100));
                        return (
                          <li key={item.id}>
                            <a className="shp-phone-seller-row" href="/stock/sellers">
                              <span className={`hm-v3-srv-rank ${idx === 0 ? 'is-top' : ''}`}>{idx + 1}</span>
                              <Avatar name={item.name} id={item.productId} size={32} />
                              <span className="shp-phone-seller-main">
                                <span className="shp-phone-seller-top">
                                  <strong className="shp-phone-seller-name">{item.name}</strong>
                                  <span className="shp-seller-val">{rupees(Number(item.valueMinor))}</span>
                                </span>
                                <span className="hm-v3-srv-bar">
                                  <span style={{ width: `${share}%` }} />
                                </span>
                              </span>
                              <span className="shp-recent-state is-green">{s.soldCountPill(item.units)}</span>
                            </a>
                          </li>
                        );
                      });
                    })()}
                  </ul>
                </Card>
              ) : null}

            </div>
        )}
        {areas.stock ? null : quickLinks}
      </div>
      {summaryOpen ? (
        <DaySummarySheet
          t={t}
          locationId={branch}
          subtitle={s.liveTodayLabel}
          onClose={() => setSummaryOpen(false)}
        />
      ) : null}
    </>
  );
}
