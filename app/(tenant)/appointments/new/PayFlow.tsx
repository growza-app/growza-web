'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, formatMoney } from '../../lib/api';
import type { PaymentMode, Provider, Service } from '../../lib/api-types';
import type { QueueEntry } from '../../lib/home-types';
import { receiptRows, type ReceiptRow } from '../../lib/receipt-text';
import { displayPhone } from '../../lib/phone';
import { servicePhotoUrl } from '../../lib/service-photos';
import { useNewVisitCopy } from '../../lib/use-copy';
import { useBranch } from '../../components/BranchProvider';
import { HeaderBranchPicker } from '../../components/HeaderBranchPicker';
import { PAYMENT_MODES } from '../../components/CheckoutSheet';
import { useLabel } from '../../components/LabelsProvider';
import { LargeAmountDeclined, useLargeAmountGuard } from '../../components/LargeAmountConfirm';
import { ReceiptShare } from '../../components/ReceiptShare';
import { useSession } from '../../components/SessionProvider';
import { IconArrowLeft, IconCheck, IconClose, IconMinus, IconPayCard, IconPayCash, IconPayOther, IconPayUpi, IconPlus, IconSearch, IconUserPlus } from '../../components/icons';
import { FormModeSwitch } from './FormModeSwitch';
import { ClientSheet } from './ClientSheet';
import { Keypad } from './Keypad';
import { ServiceSheet } from './ServiceSheet';
import { BillCard, type BillLine as Line } from './BillCard';

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
  bill: ReceiptRow[];
  phone: string | null;
  summary: string;
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
/** The counter-sale route takes 1–12 lines. */
const MAX_LINES = 12;
/** The phone remembers two things for the next sale: who did it, and whether the done screen speaks. */
const STYLIST_KEY = 'growza.pay.stylist';
const SOUND_KEY = 'growza.pay.sound';

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

function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the next sale just asks again */
  }
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

/**
 * How long each buzz lasts, in milliseconds (owner, 2026-10-10).
 *
 * A tick is the one confirmation that reaches somebody who is not reading the count on the tile: it says the tap
 * landed, without a word. So the taps made all day get the shortest buzz there is, and only the taps that CHANGE
 * something get one at all — a buzz on both adding and removing makes the two indistinguishable by feel, which is
 * worse than silence. The refusal is two short ones, because a disabled button has no other way to say no.
 */
const BUZZ = {
  /** One more on the bill. 10ms: felt, not noticed. */
  added: 10,
  /** The bill is full. The only pattern, because a refusal must not feel like a success. */
  tooMany: [20, 40, 20],
  /** The tender tile — the tap that writes the sale and cannot be undone. */
  paid: 30,
  /** ③, beside the chime and the spoken amount. */
  done: 60,
} as const;

/**
 * A short buzz, where the phone has one.
 *
 * Android only: iOS Safari has never shipped `navigator.vibrate`, so about half the phones feel nothing. Nothing
 * here is ever the only signal — the tile still turns green, the count still changes, the total still moves.
 */
function buzz(pattern: number | readonly number[]) {
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {
    /* a phone that refuses, or a browser without it: the screen still says it */
  }
}

/** Two short rising tones, drawn rather than loaded: the "payment received" of a sound box, without the box. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const at = ctx.currentTime;
    for (const [hz, start, len] of [
      [880, 0, 0.09],
      [1318, 0.1, 0.16],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at + start);
      gain.gain.exponentialRampToValueAtTime(0.25, at + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + start + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at + start);
      osc.stop(at + start + len + 0.05);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* no audio: the screen still says it */
  }
}

export function PayFlow({
  token,
  tokenGone,
  providerId,
  timezone,
  backTo,
}: {
  /** A waiting token being paid: its client, branch and services are the answer to ①. */
  token?: QueueEntry;
  tokenGone: boolean;
  /** The signed-in person's own chair, when they have one: the stylist ① starts on. */
  providerId: string | null;
  timezone: string;
  backTo?: '/appointments';
}) {
  const t = useTranslations('payFlow');
  const tcr = useTranslations('chrome');
  const nv = useNewVisitCopy();
  const locale = useLocale();
  const router = useRouter();
  const session = useSession();
  const branch = useBranch();
  const providerNoun = useLabel('provider', 'Staff member');
  const { guard, dialog } = useLargeAmountGuard();

  // The branch this sale lands at: the token's, else the one the header has chosen, else the only one.
  const location = token?.locationId ?? branch.choice ?? branch.one ?? session?.branches?.[0]?.id ?? null;
  const branchName = (session?.branches?.length ?? 0) > 1 ? (session?.branches?.find((b) => b.id === location)?.name ?? null) : null;

  const [step, setStep] = useState<'what' | 'how' | 'done'>('what');
  const [services, setServices] = useState<Service[] | null>(null);
  const [ranked, setRanked] = useState<string[] | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState<Client>({ kind: 'none' });
  const [stylistId, setStylistId] = useState<string | null>(null);
  const [override, setOverride] = useState<number | null>(null);
  const [keypad, setKeypad] = useState<string | null>(null);
  const [whoOpen, setWhoOpen] = useState<false | 'find' | 'add'>(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [saving, setSaving] = useState<PaymentMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What Next asked for and did not get. Null until Next is tapped; each half clears itself once answered. */
  const [missing, setMissing] = useState<{ client: boolean; service: boolean } | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  /** Whether the number typed on ③ has been kept as a client: null until one is given at all. */
  const [kept, setKept] = useState<'saving' | 'done' | 'failed' | null>(null);
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
    void api
      .services(location ?? undefined)
      .then((rows) => {
        if (!gone) setServices(rows);
      })
      .catch(() => {
        if (!gone) setServices([]);
      });
    // Best effort: the tiles are the branch's most-sold services when the report answers, catalogue order when not.
    void api
      .reportsServices('last_3_months', false, undefined, undefined, undefined, location)
      .then((r) => {
        if (!gone) setRanked([...r.rows].sort((a, b) => b.bookings - a.bookings).map((row) => row.id));
      })
      .catch(() => {
        if (!gone) setRanked([]);
      });
    void api
      .providers({ location })
      .then((rows) => {
        if (!gone) setProviders(rows);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [location, token]);

  // Who did it: the phone's last answer, else the signed-in stylist's own chair; and whether the done screen speaks.
  useEffect(() => {
    const last = remembered(STYLIST_KEY);
    setStylistId(last === 'nobody' ? null : (last ?? providerId));
    setSound(remembered(SOUND_KEY) !== 'off');
  }, [providerId]);

  // A token's services are the bill, once the menu is here to name them.
  useEffect(() => {
    if (!token || tokenFilled.current || !services) return;
    tokenFilled.current = true;
    const byId = new Map(services.map((s) => [s.id, s]));
    setLines(token.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => Boolean(s)).map(toLine));
  }, [token, services]);

  const toLine = (s: Service): Line => ({ serviceId: s.id, name: s.name, priceMinor: Number(s.priceMinor ?? 0) });

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

  const listMinor = lines.reduce((sum, l) => sum + l.priceMinor, 0);
  const totalMinor = override ?? listMinor;
  const countOf = (serviceId: string) => lines.filter((l) => l.serviceId === serviceId).length;
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
  // No buzz on the way down: the count and the total both drop, and a removal that felt like an addition is a lie.
  const oneLess = (serviceId: string) => {
    setLines((prev) => {
      const at = prev.map((l) => l.serviceId).lastIndexOf(serviceId);
      return at < 0 ? prev : [...prev.slice(0, at), ...prev.slice(at + 1)];
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

  /** ② — the tile that was tapped is the payment; this is the save. */
  const pay = async (mode: PaymentMode) => {
    if (saving || lines.length === 0) return;
    felt(BUZZ.paid);
    setSaving(mode);
    setError(null);
    const amounts = spread(lines, totalMinor);
    const legs = lines.map((l, i) => ({ serviceId: l.serviceId, paidAmountMinor: amounts[i]! }));
    try {
      const who = token ? { queueEntryId: token.id } : client.kind === 'existing' ? { customerId: client.id } : { customerName: (client as { name: string }).name };
      const common = {
        ...who,
        services: legs,
        paymentMode: mode,
        idempotencyKey: attemptKey,
        ...(token || !location ? {} : { location }),
      };
      const result = await guard((confirmed) =>
        api.recordCounterSale(
          stylistId
            ? { ...common, schedulableId: stylistId, ...(confirmed ? { confirmLargeAmount: true } : {}) }
            : { ...common, noStylist: true, ...(confirmed ? { confirmLargeAmount: true } : {}) },
        ),
      );
      router.refresh();
      const paidMinor = result.legs.reduce((sum, l) => sum + l.paidAmountMinor, 0);
      const stylist = result.schedulableId ? (providers.find((p) => p.id === result.schedulableId)?.displayName ?? null) : null;
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
          singles: lines.map((l, i) => ({ name: l.name, amountMinor: amounts[i]! })),
          pkg: null,
          totalMinor: paidMinor,
          paidBy: modeWord(mode),
        },
        {
          title: nv.receiptTitle,
          thanks: nv.receiptThanks,
          services: nv.receiptServices,
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
      const names = [...new Set(lines.map((l) => l.name))].join(' + ');
      setSale({
        appointmentId: result.appointmentId,
        tokenNo,
        totalMinor: paidMinor,
        mode,
        bill,
        phone: token?.customerPhone ?? (client.kind === 'existing' ? client.phone : null),
        summary: [tokenNo !== null ? nv.token(tokenNo) : null, modeWord(mode), names, stylist].filter(Boolean).join(' · '),
      });
      setStep('done');
    } catch (e) {
      if (e instanceof LargeAmountDeclined) setError(nv.amountNotSaved);
      else setError(e instanceof ApiError ? e.message : nv.saveUnknown);
    } finally {
      setSaving(null);
    }
  };

  // ③ — said, chimed and felt, once, as the screen arrives. The sound box owners trust says the amount; so does this.
  useEffect(() => {
    if (step !== 'done' || !sale || !sound) return;
    buzz(BUZZ.done);
    chime();
    try {
      const line = t('spoken', { amount: Math.round(sale.totalMinor / 100).toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN'), mode: modeWord(sale.mode) });
      const u = new SpeechSynthesisUtterance(line);
      u.lang = locale === 'hi' ? 'hi-IN' : 'en-IN';
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.speak(u);
    } catch {
      /* no voices: the screen still says it */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /*
   * ③ — the sale keeps the person, not just the number (owner, 2026-10-10).
   *
   * ① never asks for a client: a walk-in haircut has nobody to look up, and a required name on a counter whose
   * owner does not read well buys "x" and "aa". The cost was that the business never learned who came — no bill
   * on WhatsApp next time, no visit history, nobody to bring back. This is where it is paid instead: the client
   * has just asked for their bill on a number, which is the one moment they WANT to give it.
   *
   * Never in the bill's way. The `wa.me` tab is already opening when this runs, and a failure says so quietly
   * rather than taking the screen — the bill went, which is what the person at the counter was asking for.
   */
  const keepClient = (phone: string) => {
    if (!sale || kept) return;
    setKept('saving');
    void api
      .assignClientToSale(sale.appointmentId, { phone })
      .then(() => {
        setKept('done');
        setSale((s) => (s ? { ...s, phone } : s));
        router.refresh();
      })
      .catch(() => setKept('failed'));
  };

  const nextCustomer = () => {
    setKept(null);
    setLines([]);
    setOverride(null);
    setClient({ kind: 'none' });
    setSale(null);
    setError(null);
    setAttemptKey(newAttemptKey());
    tokenFilled.current = true; // a token has been paid: a second sale from this page is a plain one
    if (token) router.replace('/appointments/new?purpose=payment');
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
    setError(null);
  }, [location, token]);

  const canGoOn = lines.length > 0 && (token !== undefined || client.kind !== 'none');
  /*
   * Both complaints at once (owner, 2026-10-10).
   *
   * Next used to stop at the first thing missing: with neither a client nor a service it said only "Tap a
   * service first", and the owner learnt about the client on the NEXT tap. Two round trips to be told two
   * things the screen already knew. Each is now marked where it is missing, so one look answers both.
   */
  const onNext = () => {
    const service = lines.length === 0;
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

  // Marked only while still true, so answering one clears its own mark without clearing the other's.
  const badClient = Boolean(missing?.client) && !token && client.kind === 'none';
  const badService = Boolean(missing?.service) && lines.length === 0;

  const leave = () => router.push(backTo ?? '/');
  const payToken = token ? `&token=${encodeURIComponent(token.id)}${token.locationId ? `&location=${encodeURIComponent(token.locationId)}` : ''}` : '';
  const simpleForm = `/appointments/new?purpose=payment${payToken}`;
  const fullForm = `/appointments/new?purpose=payment&full=1${payToken}`;

  /* ---------- ③ Done ---------- */
  if (step === 'done' && sale) {
    return (
      <div className="pf pf-done-page">
        <div className="pf-done">
          <span className="pf-done-check" aria-hidden="true">
            <IconCheck />
          </span>
          <h1 className="pf-done-title" aria-live="assertive">
            {t('doneTitle', { amount: money(sale.totalMinor) })}
          </h1>
          <p className="pf-done-sub">{sale.summary}</p>
        </div>
        <ReceiptShare bill={sale.bill} phone={sale.phone} compactPreview onNumberGiven={sale.phone ? undefined : keepClient} />
        {kept ? (
          <p className={kept === 'failed' ? 'pf-error pf-kept' : 'pf-kept'} role="status">
            {kept === 'failed' ? t('clientNotKept') : kept === 'saving' ? t('keepingClient') : t('clientKept')}
          </p>
        ) : null}
        <div className="pf-done-actions">
          <button type="button" className="btn pf-go" onClick={nextCustomer}>
            {t('nextCustomer')}
          </button>
          {/*
            Next customer is the button of the three that gets pressed after every sale, so it keeps the width.
            The other two go side by side: finishing for now, and the way back to a sale that went in wrong.
          */}
          <div className="pf-done-minor">
            <button type="button" className="btn btn-ghost pf-go-alt" onClick={leave}>
              {nv.done}
            </button>
            <Link href="/appointments" className="btn btn-ghost pf-go-alt">
              {t('mistake')}
            </Link>
          </div>
          <button type="button" className="pf-sound" aria-pressed={sound} onClick={toggleSound}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4z" />
              {sound ? <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /> : <path d="m23 9-6 6M17 9l6 6" />}
            </svg>
            {sound ? t('soundOn') : t('soundOff')}
          </button>
        </div>
      </div>
    );
  }

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
        <div className="pf-pay" role="group" aria-label={t('howTitle')}>
          {(['cash', 'upi', 'card', 'other'] as const).map((mode) => (
            <button key={mode} type="button" className={`pf-pay-tile pf-pay-${mode}`} onClick={() => void pay(mode)} disabled={saving !== null} aria-busy={saving === mode}>
              <span className="pf-pay-icon" aria-hidden="true">
                {PAY_ICONS[mode]}
              </span>
              <span className="pf-pay-word">{saving === mode ? t('saving') : mode === 'other' ? t('other') : modeWord(mode)}</span>
              {/* What it means, for the owner who is not sure which word is theirs. Never the only label. */}
              <span className="pf-pay-sub">{t(`sub.${mode}`)}</span>
            </button>
          ))}
        </div>
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
    providers.length > 0 ? (
      <div className="pf-row" role="group" aria-label={providerNoun}>
        <span className="pf-row-label">{providerNoun}</span>
        <div className="pf-chips">
          {providers.map((p) => {
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
      {tokenGone ? (
        <div role="alert" className="pf-error">
          {nv.tokenGone}
        </div>
      ) : null}
      {who}
      {stylists}

      {/*
        The whole menu, under the two rows that name people and above the tiles it searches (owner, 2026-10-10).
        It was a "More…" tile at the END of the grid — eight photos away from the eye, and only reachable by
        scrolling past everything it exists to shortcut. A bar reads as "type what you are looking for"; the
        tiles below it stay the fast path for what is sold all day.
      */}
      {services && services.length > TILES ? (
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

      {badService ? (
        <p className="pf-miss pf-miss-wide" role="alert">
          {t('pickOne')}
        </p>
      ) : null}
      {services === null ? (
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
                  <img className="pf-tile-photo" src={servicePhotoUrl(s)} alt="" loading="lazy" />
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
          onClick={() => setKeypad(String(Math.round(totalMinor / 100)))}
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
          onClose={() => setBillOpen(false)}
        />
      ) : null}
      {menuOpen && services ? (
        <ServiceSheet
          services={services}
          counts={new Map(services.map((s) => [s.id, countOf(s.id)]))}
          onPick={(s) => {
            addOne(s);
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      {keypad !== null ? (
        <Keypad
          title={t('keypadTitle')}
          value={keypad}
          hint={t('listPrice', { amount: money(listMinor) })}
          onChange={setKeypad}
          onDone={() => {
            const rupees = Number(keypad);
            setOverride(Number.isFinite(rupees) && keypad !== '' && rupees * 100 !== listMinor ? rupees * 100 : null);
            setKeypad(null);
          }}
          onClose={() => setKeypad(null)}
        />
      ) : null}
    </div>
  );
}
