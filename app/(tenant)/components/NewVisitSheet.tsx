'use client';
/**
 * A UUID for one attempt at recording a visit. Jira GRW-204.
 *
 * `crypto.randomUUID()` requires a SECURE CONTEXT, and the dev box is reached
 * over plain http on a LAN — where it is `undefined` in Chrome and Safari. So
 * the fallback is not theoretical; it is the path taken every time anybody
 * tests this from a phone on the office wifi.
 *
 * Built as 32 hex characters formatted 8-4-4-4-12, because the server validates
 * the shape (`uuidish`) and the column is a Postgres `uuid`. A first draft
 * concatenated `Date.now().toString(16)` into the first group, which is eleven
 * characters, not eight — a string that looks like a UUID at a glance and is
 * rejected by the cast.
 *
 * Not cryptographic, and does not need to be: this value only has to be unique
 * within one tenant for the few seconds between a request and its retry.
 */
function newAttemptKey(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

import Link from 'next/link';
import { useNewVisitCopy } from '../lib/use-copy';
import { useLocale, useTranslations } from 'next-intl';
import { formatDateWithWeekday } from '../lib/format';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  BookingConflictError,
  formatMoney,
  formatTime,
  type Appointment,
  type AvailabilityResponse,
  type ChairNow,
  type Customer,
  type Offer,
  type PaymentMode,
  type Provider,
  type QueueEntry,
  type Service,
} from '../lib/api';
import { matchItems, MIN_CHARS } from '../lib/service-match';
import { extraSuggestions } from '../lib/service-suggest';
import { useServiceSuggestions } from '../lib/useServiceSuggestions';
import { useLabel } from './LabelsProvider';
import { LargeAmountDeclined, useLargeAmountGuard } from './LargeAmountConfirm';
import { useBranch } from './BranchProvider';
import { useSession } from './SessionProvider';
import { canSee, type MemberRole } from '../lib/nav-policy';
import { PhoneField } from './PhoneField';
import { BookAgainCard, type BookAgainPlan } from './BookAgainCard';
import type { FreeTime } from '../lib/book-again';
import { fromStoredPhone, toStoredPhone } from '../lib/phone';
import { usePhoneProblem } from '../lib/use-phone-problem';
import { CheckoutSheet, PAYMENT_MODES } from './CheckoutSheet';
import { IconArrowLeft, IconCheck, IconClose, IconSearch } from './icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { useNoProvider } from '../lib/use-no-provider';
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS } from '../lib/search-tuning';

/**
 * Jira GRW-199 · GRW-219 — the walk-in sheet: client first, then the booking.
 *
 * The FAB's "Walk-in now" used to open the free-times grid, on the argument
 * that a walk-in is a booking that starts now. That screen cannot book "now"
 * (the availability engine clamps every start to `now + 60min`) and refuses
 * outright when the chairs are full — which is the exact moment a walk-in flow
 * is for.
 *
 * The order of the two stages is the whole design. A salon running
 * first-come-first-serve does not need a calendar; it needs to know WHO this
 * is, because the client record is the product.
 *
 * ## A name is required and a phone is not
 *
 * The inverse of what the booking API has always asked for, and the right way
 * round for a room with a person standing in it. The salon always has something
 * to call them; it frequently has no number. A record with a number and no name
 * is a row nobody can recognise — and a mandatory phone field just produces
 * 9999999999, which collides, so every anonymous walk-in merges into one
 * fictional client.
 */

function digitsOf(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/** A picked service or combo leg, in the order it will happen. */
export interface PickedItem {
  serviceId: string;
  name: string;
  durationMin: number;
  priceMinor: string | null;
  /**
   * Jira GRW-290 — Record payment only: what they paid for this line, as typed
   * (rupees). Prefilled from the price, or the line's share of a combo price.
   */
  paidRupees?: string;
}

/** Rupees as typed → minor units, or null when it is not a usable amount (BR-02: 0 is fine, blank or negative is not). */
export function rupeesToMinor(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * A combo's fixed price spread over its lines by each line's list price, the
 * remainder on the last line so the shares always sum to the combo price —
 * the same rule CheckoutSheet's `splitComboDefaults` uses for a booked combo.
 */
export function splitComboRupees(items: PickedItem[], comboPriceMinor: string | null): string[] {
  const list = items.map((i) => Number(i.priceMinor ?? 0));
  if (!comboPriceMinor) return list.map((m) => String(m / 100));
  const combo = Number(comboPriceMinor);
  const listTotal = list.reduce((a, b) => a + b, 0);
  let allocated = 0;
  return list.map((m, i) => {
    const share = i === list.length - 1 ? combo - allocated : listTotal > 0 ? Math.round((m / listTotal) * combo) : 0;
    allocated += share;
    return String(share / 100);
  });
}

/** Total minutes of a chosen list — what "starts now" runs until. */
export function totalMinutes(items: PickedItem[]): number {
  return items.reduce((sum, i) => sum + i.durationMin, 0);
}

/** Sum of list prices, or the combo's fixed price when one is in play. */
export function totalMinor(items: PickedItem[], comboPriceMinor: string | null): string {
  if (comboPriceMinor) return comboPriceMinor;
  return String(items.reduce((sum, i) => sum + Number(i.priceMinor ?? 0), 0));
}

/** Jira GRW-524 — the stylist dropdown's two values that are not a stylist's id. */
const WI_WHOEVER = '__whoever__';
const WI_NO_STYLIST = '__none__';

type PickedClient =
  /** Jira GRW-392 — `locationId`: the branch this client belongs to, which is where their visit is. */
  | { kind: 'existing'; id: string; name: string | null; phone: string | null; locationId?: string }
  | { kind: 'new'; name: string; phone: string };

type Stage =
  /** Jira GRW-514 — find them, or add them: one screen (there was a separate `newClient` step). */
  | { step: 'client' }
  | { step: 'details'; client: PickedClient }
  /** `later` only — which day and which slot. A walk-in's answer is "now". */
  | { step: 'when'; client: PickedClient }
  | { step: 'saving'; client: PickedClient }
  | { step: 'done'; client: PickedClient; result: WalkInDone }
  /** Jira GRW-222 — waiting in the queue; no stylist and no visit yet. */
  | { step: 'queued'; client: PickedClient; tokenNo: number | null }
  | { step: 'error'; client: PickedClient; message: string }
  /** Jira GRW-290 — Record payment settled in one go. */
  | { step: 'paid'; client: PickedClient; result: WalkInDone; totalMinor: number; mode: PaymentMode };

interface WalkInDone {
  appointmentId: string;
  customerId: string;
  /** Jira GRW-403 — the token this visit is: the one it was paid from, or the branch's next number. */
  tokenNo?: number | null;
  /** Every leg, in running order — the whole visit is settled in one checkout. */
  legIds: string[];
  /** Jira GRW-293 — null for a visit recorded with no stylist. */
  schedulableId: string | null;
  startAt: string;
  overlapping: boolean;
}

function clientName(client: PickedClient): string {
  return client.kind === 'new' ? client.name : (client.name?.trim() || client.phone || '');
}

/**
 * `now` records a visit that is happening; `later` reserves a future slot.
 *
 * One sheet rather than two, because the first two questions — who is this, and
 * what are they having — are identical, and duplicating a searchable client
 * picker is how two screens start drifting apart. Only the last question and
 * the write path differ, and both differ for a stated reason: a walk-in is a
 * RECORD and never refuses, an advance booking is a RESERVATION and must.
 */
export type VisitMode = 'now' | 'later';

/**
 * `payment` is "Record payment" on Home: the same walk-in steps — who, what,
 * which stylist — for a visit that has already happened, so it ends in the
 * till rather than in a started visit. It is always a walk-in (money is never
 * taken for a future slot), so the phone stays optional: a client who will not
 * give a number must not stop the money being recorded.
 */
export type VisitPurpose = 'visit' | 'payment';

/** Jira GRW-403 — who a token was issued for, as the client this sheet records a visit for. */
function clientOfToken(token: QueueEntry): PickedClient {
  return token.customerId
    ? { kind: 'existing', id: token.customerId, name: token.customerName, phone: token.customerPhone, locationId: token.locationId }
    : { kind: 'new', name: token.customerName, phone: token.customerPhone ?? '' };
}

export function NewVisitSheet({
  onClose,
  timezone,
  mode: initialMode = 'now',
  purpose = 'visit',
  presentation = 'sheet',
  token,
}: {
  onClose: () => void;
  timezone: string;
  mode?: VisitMode;
  purpose?: VisitPurpose;
  /**
   * Jira GRW-403 (epic GRW-283) — Record payment for a token that is still waiting.
   *
   * The client is the token's, so the sheet opens on the services step; whatever the token was issued with is
   * already picked; the branch is the one they wait at. The stylist is who DID the work, or nobody ("No stylist",
   * the default) — "Whoever is free" is not offered, because it reserves a chair and the work is already done.
   * Mark done pays the token (`POST /counter-sales` with `queueEntryId`), which closes it: the board reads Paid.
   */
  token?: QueueEntry;
  /**
   * Jira GRW-297 — `'page'` renders the same stages, the same markup and
   * copy, without the backdrop and the fixed-position bottom-sheet frame:
   * the New Booking route (`/appointments/new`), not a pop-up over it.
   * `onClose` is what a page presentation navigates back with; a sheet
   * unmounts on it as before.
   */
  presentation?: 'sheet' | 'page';
}) {
  const tmin = useTranslations('services');
  const nv = useNewVisitCopy();
  // Jira GRW-480 (S-18c) — "That is a large amount" before a typo is saved as takings.
  const { guard: guardLargeAmount, dialog: largeAmountDialog } = useLargeAmountGuard();
  const locale = useLocale();
  // Jira GRW-363 — the same phrase the row this choice makes carries on Home and in Reports.
  const noProviderWord = useNoProvider();
  /*
   * Jira GRW-519 — the Booking date decides the kind of visit; there are no Walk-in / For later tabs.
   *
   * Left alone it is a walk-in now. Once the owner chooses a date — even today's, which means "later today" —
   * it is a booking for that day. `initialMode` ('later', from a link that asks for one) starts with a date
   * already chosen. Before GRW-519 this was a control of its own (two tabs), which the date made redundant: a
   * receptionist who realises the customer wants Saturday just changes the date.
   */
  const forPayment = purpose === 'payment';
  const [dateChosen, setDateChosen] = useState(!forPayment && initialMode === 'later');
  /**
   * Jira GRW-527 — the Booking time ('HH:mm', or '' for none). Setting one is what makes a booking for TODAY,
   * which the date alone cannot (today is the walk-in): "later today" is a time, "another day" is a date.
   */
  const [timeWanted, setTimeWanted] = useState('');
  const timeWantedRef = useRef('');
  timeWantedRef.current = timeWanted;
  const mode: VisitMode = dateChosen || timeWanted !== '' ? 'later' : 'now';
  const later = mode === 'later';
  const checkPhone = usePhoneProblem();
  const tcr = useTranslations('chrome');
  const tw = useTranslations('staffWizard');
  const router = useRouter();
  const clientNoun = useLabel('customer', 'Client');
  const providerNoun = useLabel('provider', 'Staff member');
  const servicesNoun = useLabel('services', 'Services');

  const [stage, setStage] = useState<Stage>(() => (token && forPayment ? { step: 'details', client: clientOfToken(token) } : { step: 'client' }));
  /** Jira GRW-403 — paying a waiting token: its client, its branch, its services. */
  const paysToken = forPayment && token ? token : null;

  // Jira GRW-342 — the pop-up form is a dialog: focus in, Tab kept inside, Escape closes (not mid-save). The routed
  // page is a page, and is left alone. Up here, before any early return, so the hook order never changes.
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose: stage.step === 'saving' ? undefined : onClose, active: presentation !== 'page' });

  /*
   * Jira GRW-204 — one token for this attempt, generated once and reused.
   *
   * `useState` with an initialiser, NOT `useMemo` and not a fresh value per
   * render: this must survive every re-render between pressing Start and the
   * response arriving, because the whole point is that the RETRY carries the
   * same token as the request that already succeeded.
   *
   * The sheet unmounts when it closes, so the next visit gets a new one. That
   * is the correct scope — a key that outlived the sheet would make the second
   * genuine walk-in of the day return the first one's visit.
   *
   * `crypto.randomUUID()` needs a secure context; on plain http over a LAN it
   * is undefined in some browsers, which is exactly how the dev box is
   * reached. The fallback is not cryptographic and does not need to be — this
   * value only has to be unique within one tenant.
   */
  const [attemptKey] = useState(newAttemptKey);

  // Stage 1 — find them
  const [term, setTerm] = useState('');
  // Jira GRW-520 — the matches are a dropdown under the box: open while typing, closed by a pick, Escape or
  // tapping elsewhere; `activeIdx` is the row the arrow keys are on (-1: none).
  const [comboOpen, setComboOpen] = useState(true);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [results, setResults] = useState<Customer[]>([]);
  /**
   * Jira GRW-454 — the same search, at the other branches. Offered only once something has been typed: it is a
   * second question ("do they exist elsewhere?"), and putting those rows in the browsable list would be GRW-453's
   * bug again, where most of what the picker offered belonged to a branch nobody had chosen.
   */
  const [elsewhere, setElsewhere] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);

  // Stage 1, the second half of it (Jira GRW-514) — add them, on the same screen as the search
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [nameError, setNameError] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  /**
   * Jira GRW-514 — the search seeds the add block (a typed number goes to Phone, anything else to Name) so
   * nothing is typed twice, but only until the person has typed in that block themselves: a seed must never
   * overwrite what the desk wrote.
   */
  const nameEdited = useRef(false);
  const phoneEdited = useRef(false);
  const addNewRef = useRef<HTMLDivElement>(null);

  // Stage 2
  const [services, setServices] = useState<Service[] | null>(null);
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [serviceTerm, setServiceTerm] = useState('');
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [comboPriceMinor, setComboPriceMinor] = useState<string | null>(null);
  /**
   * Jira GRW-291 — a combo is one line, not its services split apart: the
   * title, and the amount typed for it (Record payment only; otherwise the
   * fixed combo price).
   */
  const [comboTitle, setComboTitle] = useState<string | null>(null);
  const [comboAmountText, setComboAmountText] = useState('');
  /**
   * Jira GRW-292 — a service added while a combo is chosen used to dissolve
   * the whole combo back to full-price rows: `assertOfferPricesTheseServices`
   * on the server refuses an offer whose `serviceIds` are not EXACTLY its own
   * set, so the sheet cleared `offerId` the moment the list changed — silently,
   * with the discount gone and nothing on screen saying so.
   *
   * Extras are the fix: the combo's own `picked` never changes, so the walk-in
   * still books it at its offer price, and anything added alongside it lives
   * here instead — its own row, its own price. Record payment settles both in
   * one checkout via `extraServices` (the same mechanism a stylist already
   * uses to sell something extra in the chair). Walk-in now and For later have
   * no such second step, so there the primary button stays disabled with an
   * explanation while an extra sits next to a combo — see the footer.
   */
  const [extras, setExtras] = useState<PickedItem[]>([]);
  const [schedulableId, setSchedulableId] = useState<string | null>(null);
  /**
   * Jira GRW-293 (epic GRW-283) — Record payment only: the desk can settle a
   * visit without choosing anyone. A separate boolean rather than overloading
   * `schedulableId === null`, which already means "whoever is free" for
   * Walk-in now / For later — those two modes must keep reserving a chair
   * exactly as before, so this can only ever be true when `forPayment` is.
   */
  // Jira GRW-403 — a token's visit has happened: nobody, unless the desk names who did it.
  const [noStylist, setNoStylist] = useState(Boolean(token && forPayment));
  // GRW-198 — the booking in the chosen chair whose client never turned up. Declared here: a branch change clears it.
  const [reclaim, setReclaim] = useState<string | null>(null);
  // Jira GRW-290 — Record payment: how they paid, and the visit once it exists.
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  /*
   * Kept after the walk-in saves, so a retry after a failed payment pays for
   * THAT visit instead of asking for a second one. The lines are locked from
   * then on — the visit's services are already written — but the amounts and
   * the mode can still be corrected before trying again.
   */
  const [savedVisit, setSavedVisit] = useState<WalkInDone | null>(null);
  /*
   * Jira GRW-235 — which branch the client is at, for a business with more
   * than one. "Whoever is free" and the chairs below are that branch's staff
   * only; without it an Indiranagar client could be handed a stylist at MG
   * Road. Defaults to the main branch; absent (one branch) the API behaves as
   * it always has.
   *
   * OWNER ONLY (product decision, 2026-09-14: "multi branch is only for
   * owner"). A receptionist books as before — "whoever is free" across the
   * business, and the booking still lands at its stylist's branch (GRW-230) —
   * until members have a branch of their own. A degraded session with no role
   * is treated as owner, as everywhere else (GRW-157 BR-03).
   */
  const session = useSession();
  const isOwner = (session?.role ?? 'owner') === 'owner';
  const branches = isOwner ? (session?.branches ?? []) : [];
  // Jira GRW-377 — opens on the branch the dashboard is looking at; the chips below change it for this visit only.
  const branchContext = useBranch();
  const [branchId, setBranchId] = useState<string | null>(
    branches.length > 1 ? (branches.find((b) => b.id === branchContext.one)?.id ?? branches[0]!.id) : null,
  );
  // QA (Jira GRW-377) — on a full reload the sheet renders before the shared branch is `ready`, so the default
  // above is the main branch. Take the remembered one when it arrives, unless the person already tapped a chip.
  const branchTouched = useRef(false);
  useEffect(() => {
    if (!branchContext.ready || branchTouched.current || branches.length < 2) return;
    const shared = branches.find((b) => b.id === branchContext.one);
    if (shared) setBranchId(shared.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchContext.ready, branchContext.one]);
  /*
   * Jira GRW-379 — the branch whose menu this visit is booked from. A service is sold at ONE branch, so the
   * list, the combos, the suggestions and the stylists all follow it: the owner's chip, or for anyone else the
   * dashboard's own branch (a pinned receptionist's is theirs, and their session lists no other). Every write
   * names it, so a queue entry or a visit lands where its services are sold.
   */
  /*
   * Jira GRW-453 — the branch is chosen FIRST, and nothing picked afterwards may change it.
   *
   * Jira GRW-392 made a client picked from the list decide the branch instead, because a client belongs to one
   * branch and the database refuses a booking that pairs them with another (`appointment_client_same_branch_fk`).
   * But the picker below offered every branch's clients, so at a branch selling one service, 19 of the 20 rows
   * on offer silently moved the booking somewhere else — menu, stylists, times and the write all followed, and
   * the only sign was the branch radio group turning into a single chip naming a branch nobody had asked for.
   *
   * Owner decision 2026-10-03: a client record is unique per branch (`customer_tenant_location_wa_phone`, and a
   * number is optional, so the branch is part of telling two same-named clients apart), and the same person is
   * shared across branches by having a record at each. So the branch leads: the picker shows that branch's own
   * clients, and the client picked from it is already one of them. Nothing has to move.
   *
   * Paying a token is the one exception, and not really one: that visit already exists, at its own branch.
   */
  const tokenBranch = paysToken?.locationId ?? null;
  const listBranch = tokenBranch ?? (branches.length > 1 ? branchId : branchContext.one);
  /** Settled, so it is said rather than asked: a token's own branch, or the one the picked client was found at. */
  const branchSettled = Boolean(tokenBranch) || ('client' in stage && stage.client.kind === 'existing');
  /*
   * One person can be a client of two branches, so each row says whose client it is.
   * Jira GRW-392 (review): this was owner-only, and a manager saw two identical rows and booked the wrong branch.
   */
  const openBranches = session?.branches ?? [];
  const branchNameOf = (locationId: string | undefined) =>
    openBranches.length > 1 && locationId ? openBranches.find((b) => b.id === locationId)?.name : undefined;
  /**
   * A client row's second line: how many visits, their number if they have one, their branch if there
   * is more than one. Built as a string so the row is a name over one quiet line, rather than three
   * facts and a count fighting for the same row (owner, 2026-10-04).
   */
  const clientMetaLine = (c: Customer) =>
    [nv.visits(c.totalBookings), c.waPhone, branchNameOf(c.locationId)].filter(Boolean).join(' · ');
  /*
   * A client of a branch that has since closed is served at an open one: carried over as that branch's client by
   * name and number (the upsert finds or makes their record there), never booked at the closed branch.
   */
  const pickClient = (c: Customer) => {
    const closed = Boolean(c.locationId) && openBranches.length > 0 && !openBranches.some((b) => b.id === c.locationId);
    setStage({
      step: 'details',
      client: closed
        ? { kind: 'new', name: c.name?.trim() || nv.noName, phone: c.waPhone ?? '' }
        : { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone, locationId: c.locationId },
    });
  };
  /**
   * Jira GRW-454 — "Add them to {branch}": a client of another branch, taken on here.
   *
   * It does not pick them — it cannot, because the booking must use a client of its own branch
   * (`appointment_client_same_branch_fk`). It opens the add step with their name and number already in it, so
   * the desk sees exactly what will be made here and can correct a spelling first. Saving upserts by number, so
   * doing it twice finds the record rather than making a second one.
   *
   * Only the name and the number travel. Their visits, spend and history stay with the branch they made them
   * at: a client record is unique per branch, and this is a different record of the same person.
   */
  const bringHere = (c: Customer) => {
    setNewName(c.name?.trim() ?? '');
    setNewPhone(fromStoredPhone(c.waPhone));
    // Their details are now what the desk is confirming, so the search must not seed over them.
    nameEdited.current = true;
    phoneEdited.current = true;
    setStage({ step: 'client' });
    setComboOpen(false);
    // Jira GRW-514 — the add block is on this screen now, below the list: bring it into view.
    window.setTimeout(() => addNewRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  };
  const atBranch = listBranch ? { location: listBranch } : {};
  // What was picked is on the menu of the branch it was picked at; another branch sells its own rows. The chosen
  // stylist and reclaimed chair are that branch's too — however the branch changed (a chip, or picking a client of
  // another branch after Back), none of it may ride along to the new one.
  const [menuBranch, setMenuBranch] = useState(listBranch);
  if (menuBranch !== listBranch) {
    setMenuBranch(listBranch);
    setSchedulableId(null);
    setReclaim(null);
    setPicked([]);
    setExtras([]);
    setOfferId(null);
    setComboPriceMinor(null);
    setComboTitle(null);
    setComboAmountText('');
    setServiceTerm('');
  }

  /*
   * The REAL appointment rows for this visit, fetched before checkout opens.
   *
   * The first version handed `CheckoutSheet` an object literal cast through
   * `any`, carrying only the four fields the sheet's header renders. That was
   * wrong in three visible ways at once: the total came out ₹0 (the price
   * fields were absent, so `splitComboDefaults` had nothing to seed from), the
   * stylist read "No stylist set" (`providerId` was absent), and a three-service
   * walk-in offered ONE service to pay for, because `groupMembers` was empty.
   *
   * A walk-in's whole point is capturing the money, so a till that opens at ₹0
   * and settles a third of the visit is worse than not offering it.
   */
  const [checkoutRows, setCheckoutRows] = useState<Appointment[] | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  /*
   * Jira GRW-289 — Record payment's till was closed without saving.
   *
   * Cancel, the close button and a tap on the backdrop all called the same
   * `onClose`, which shut the whole sheet: the visit had been recorded by
   * Finish, nothing had been paid, and nothing on screen said so. The owner
   * believed the money was in. Now the sheet steps back to the done screen and
   * says it plainly — "Take payment now" is right there, and "Done" still
   * leaves. Telling, not blocking.
   */
  const [tillClosedUnpaid, setTillClosedUnpaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.providers(), api.offers().catch(() => [] as Offer[])])
      .then(([prov, offs]) => {
        if (cancelled) return;
        setProviders(prov);
        setOffers(offs.filter((o) => o.active));
      })
      .catch(() => {
        /* Each picker renders its own empty state. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Jira GRW-379 — the branch's own menu, read again whenever the branch changes. Not before the remembered
  // branch has arrived (`ready`), or an Indiranagar desk would be shown MG Road's menu for a moment.
  useEffect(() => {
    if (!branchContext.ready) return;
    let cancelled = false;
    setServices(null);
    void api
      .services(listBranch ?? undefined)
      .then((svc) => {
        if (!cancelled) setServices(svc);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listBranch, branchContext.ready]);

  /*
   * Debounced client search — the shape SearchClient established.
   *
   * `api.customers`, NOT `api.search`: `GET /api/v1/search` is not on the
   * receptionist's allow-list, and a receptionist is who lives in this screen.
   * The picker would have returned nothing for exactly the role it is for.
   */
  useEffect(() => {
    if (term.trim().length < SEARCH_MIN_CHARS) {
      setResults([]);
      setElsewhere([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void api
        // Jira GRW-453 — this branch's own clients. A name is not unique and a number is optional, so a search
        // across the business would offer two indistinguishable rows for one booking that can only be at one.
        .customers({ search: term.trim(), limit: 8, location: listBranch })
        .then((page) => {
          if (!cancelled) setResults(page.rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
      /*
       * Jira GRW-454 — and the same search across the business, so the desk can say "they come to Indiranagar"
       * and add them here without typing a name and a number that are already on file.
       *
       * Only when there is more than one branch to look at, which in this sheet means an owner: `branches` is
       * already owner-only, and a branch's own desk is scoped to it server-side by design (GRW-393, where being
       * told a client "belongs to another branch" was itself the leak). They reach the same place by typing.
       */
      if (branches.length > 1) {
        void api
          .customers({ search: term.trim(), limit: 8 })
          .then((page) => {
            if (!cancelled) setElsewhere(page.rows.filter((c) => c.locationId && c.locationId !== listBranch));
          })
          .catch(() => {
            if (!cancelled) setElsewhere([]);
          });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, listBranch, branches.length]);

  const serviceById = useMemo(() => new Map((services ?? []).map((s) => [s.id, s])), [services]);

  /**
   * Jira GRW-375 — services closest in MEANING, when a provider is configured.
   *
   * Jira GRW-449 — asked only once the typist pauses and has typed enough to mean something, cached per
   * branch, and switched off for the life of the sheet by a 503. All four rules, and the reasons for them,
   * now live in `useServiceSuggestions` — the package builder and the Services screen ask the same way.
   */
  const remote = useServiceSuggestions(serviceTerm, listBranch);

  /**
   * Jira GRW-375 — "phacial" finds Facial. The whole catalogue is already in
   * this component, so the matching happens here: no request, no waiting, and
   * it works on a bad connection at the desk. `service-match.ts` explains how.
   */
  const filteredServices = useMemo(() => {
    if (!services) return [];
    const q = serviceTerm.trim();
    if (q.length < MIN_CHARS) return services.slice(0, 6);
    return matchItems(
      services.map((s) => ({ item: s, text: [s.name] })),
      q,
      20,
    );
  }, [services, serviceTerm]);

  /**
   * Meaning-based extras, shown as their own "Also try" row under the list rather than appended to it: QA found
   * appended rows landing below the list's four-row fold, where nobody saw them.
   */
  const alsoTry = useMemo(
    () => extraSuggestions(filteredServices, remote, serviceTerm, (id) => serviceById.get(id)),
    [filteredServices, remote, serviceTerm, serviceById],
  );

  /**
   * Combos only — an offer with no fixed price is an announcement, not something to book.
   *
   * Jira GRW-379 — and only where every one of its services is on this branch's menu: the server refuses a
   * combo whose services are sold elsewhere, or that is missing one, so it is never offered here.
   */
  const combos = useMemo(
    () => (offers ?? []).filter((o) => o.serviceIds.length > 0 && o.serviceIds.every((id) => serviceById.has(id))),
    [offers, serviceById],
  );

  /**
   * Jira GRW-290 — the search bar finds combos too, not only the chips under an
   * empty search. Jira GRW-375 — and by the services inside them, so "phacial"
   * offers the bridal package that contains a Facial.
   */
  const matchingCombos = useMemo(() => {
    const q = serviceTerm.trim();
    if (q.length < MIN_CHARS) return [];
    return matchItems(
      combos.map((o) => ({ item: o, text: [o.title, ...o.serviceIds.map((id) => serviceById.get(id)?.name ?? '')] })),
      q,
    );
  }, [combos, serviceTerm, serviceById]);

  /*
   * Jira GRW-403 — what the token was issued with, picked once the branch's menu (and its combos) have loaded. A
   * token issued by name alone (GRW-284) picks nothing: services are chosen here, at payment.
   */
  const tokenPrefilled = useRef(false);
  useEffect(() => {
    if (!paysToken || tokenPrefilled.current || !services || offers === null) return;
    tokenPrefilled.current = true;
    const combo = paysToken.offerId ? combos.find((o) => o.id === paysToken.offerId) : undefined;
    if (combo) {
      applyCombo(combo);
      return;
    }
    const items = paysToken.serviceIds.map((id) => serviceById.get(id)).filter((sv): sv is Service => Boolean(sv));
    if (items.length > 0) setPicked(items.map(toItem));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paysToken, services, offers]);

  const toItem = (s: Service): PickedItem => ({
    serviceId: s.id,
    name: s.name,
    durationMin: s.durationMin,
    priceMinor: s.priceMinor,
    ...(forPayment ? { paidRupees: String(Number(s.priceMinor ?? 0) / 100) } : {}),
  });

  const addService = (s: Service) => {
    const item = toItem(s);
    // Jira GRW-292 — beside the combo, not instead of it.
    if (comboActive) {
      setExtras((prev) => [...prev, item]);
    } else {
      setPicked((prev) => [...prev, item]);
    }
    setServiceTerm('');
  };

  const applyCombo = (offer: Offer) => {
    const items = offer.serviceIds
      .map((id) => serviceById.get(id))
      .filter((s): s is Service => Boolean(s))
      .map((s) => ({ serviceId: s.id, name: s.name, durationMin: s.durationMin, priceMinor: s.priceMinor }));
    if (items.length === 0) return;
    const shares = forPayment ? splitComboRupees(items, offer.comboPriceMinor) : [];
    setPicked(forPayment ? items.map((item, i) => ({ ...item, paidRupees: shares[i] })) : items);
    setOfferId(offer.id);
    setComboPriceMinor(offer.comboPriceMinor);
    setComboTitle(offer.title);
    setComboAmountText(offer.comboPriceMinor ? String(Number(offer.comboPriceMinor) / 100) : '');
    setExtras([]);
    setServiceTerm('');
  };

  /**
   * Jira GRW-291 — one amount for the whole combo, not one per service.
   *
   * Typed value drives the per-service split that `payFor` already reads
   * (`item.paidRupees`), so checkout still settles each leg with its own
   * share and nothing downstream of Mark done has to know a combo is one
   * line on screen. An amount that doesn't parse is written straight to
   * every line as blank, so the existing per-line validity check is what
   * disables Mark done — one rule, not two.
   */
  const setComboAmount = (value: string) => {
    setComboAmountText(value);
    const minor = rupeesToMinor(value);
    if (minor === null) {
      setPicked((prev) => prev.map((item) => ({ ...item, paidRupees: '' })));
      return;
    }
    const shares = splitComboRupees(picked, String(minor));
    setPicked((prev) => prev.map((item, i) => ({ ...item, paidRupees: shares[i] })));
  };

  /**
   * Removing the combo does not throw away whatever was added beside it —
   * those rows just stop being "beside a combo" and become the plain list.
   */
  const removeCombo = () => {
    setPicked(extras);
    setExtras([]);
    setOfferId(null);
    setComboPriceMinor(null);
    setComboTitle(null);
    setComboAmountText('');
  };

  /**
   * Jira GRW-341 — "Book again": fill in what the client had last time. A combo comes back as the combo, at its
   * offer price; anything else as plain services. The stylist is set only when they are still here — otherwise
   * it stays "whoever is free", as for any new booking.
   */
  const applyPlan = (plan: BookAgainPlan) => {
    if (plan.offer) {
      applyCombo(plan.offer);
    } else {
      setPicked(plan.services.map(toItem));
      setExtras([]);
      setOfferId(null);
      setComboPriceMinor(null);
      setComboTitle(null);
      setComboAmountText('');
    }
    setSchedulableId(plan.providerId);
    setNoStylist(false);
  };

  /** A time chosen on the Book again card, waiting for the time step to load its own list of slots. */
  const pendingSlot = useRef<string | null>(null);

  const bookAgainAt = (client: PickedClient, plan: BookAgainPlan, time: FreeTime) => {
    applyPlan(plan);
    setDay(time.day);
    // A time picked on the Book again card is a booking, whichever day it is on.
    setDateChosen(true);
    pendingSlot.current = time.utc;
    setStage({ step: 'when', client });
  };

  const removeExtraAt = (index: number) => {
    setExtras((prev) => prev.filter((_, i) => i !== index));
  };

  const setExtraAmountAt = (index: number, value: string) => {
    setExtras((prev) => prev.map((item, i) => (i === index ? { ...item, paidRupees: value } : item)));
  };

  const removeAt = (index: number) => {
    setPicked((prev) => prev.filter((_, i) => i !== index));
    setOfferId(null);
    setComboPriceMinor(null);
    setComboTitle(null);
    setComboAmountText('');
  };

  const setAmountAt = (index: number, value: string) => {
    setPicked((prev) => prev.map((item, i) => (i === index ? { ...item, paidRupees: value } : item)));
  };

  /**
   * Jira GRW-451 — everything this visit is, in running order: the combo's own legs and anything beside them.
   *
   * Every line that tells the desk what just happened — "Token 4 · …", "Recorded · …", "Paid ₹900 · …", and the
   * one under a chosen slot — mapped `picked` alone, so a service added beside a combo was booked, charged and
   * never named. The slot line also measured `totalMinutes(picked)`, which undercounts the span the
   * availability query had already asked for (it sums `picked` AND `extras`): a 30-minute summary over a
   * 50-minute booking.
   */
  const everything = useMemo(() => [...picked, ...extras], [picked, extras]);
  const everythingNamed = everything.map((p) => p.name).join(' + ');

  // Jira GRW-291 — a combo renders as one line: what the services list for, what it saves, what it costs.
  const comboActive = Boolean(offerId && comboPriceMinor);
  const comboListMinor = picked.reduce((sum, item) => sum + Number(item.priceMinor ?? 0), 0);
  const comboSavingMinor = comboPriceMinor ? Math.max(0, comboListMinor - Number(comboPriceMinor)) : 0;

  const amountsValid =
    picked.every((item) => rupeesToMinor(item.paidRupees) !== null) &&
    extras.every((item) => rupeesToMinor(item.paidRupees) !== null);
  const paidTotalMinor =
    picked.reduce((sum, item) => sum + (rupeesToMinor(item.paidRupees) ?? 0), 0) +
    extras.reduce((sum, item) => sum + (rupeesToMinor(item.paidRupees) ?? 0), 0);
  // Jira GRW-292 — the combo's own price (typed, in Record payment) plus whatever sits beside it.
  const comboWithExtrasTotalMinor = forPayment
    ? (rupeesToMinor(comboAmountText) ?? 0) + extras.reduce((sum, item) => sum + (rupeesToMinor(item.paidRupees) ?? 0), 0)
    : Number(comboPriceMinor ?? 0) + extras.reduce((sum, item) => sum + Number(item.priceMinor ?? 0), 0);
  // --- `later` only: which day, and which slot on it ---
  /** Jira GRW-518 — today in the salon's zone: the Booking date's default, and the earliest it can be. */
  const todayIso = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date()), [timezone]);
  // Jira GRW-521 — the date shows today unless a link asked for a later booking, which starts on tomorrow: a
  // booking for today is a walk-in, so "later" with today's date would not be one.
  // Jira GRW-527 — now, as 'HH:mm' in the salon's zone: the earliest a booking TODAY can be.
  const hmFormat = useMemo(() => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), [timezone]);
  const nowHm = hmFormat.format(new Date());
  const [day, setDay] = useState(() => {
    if (!dateChosen) return todayIso;
    const d = new Date(`${todayIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  /*
   * Jira GRW-533 — the Booking time is a list of quarter-hours, never a free-typed box, so a time that has
   * passed is simply not in it. Today it starts at the next quarter-hour after now; any other day is the whole
   * day. The first entry (empty) is no time: a walk-in now.
   */
  // Rebuilt only when the day, the quarter-hour or the language changes — not on every keystroke in Name / Phone.
  const firstMin = day === todayIso ? (Math.floor((Number(nowHm.slice(0, 2)) * 60 + Number(nowHm.slice(3, 5))) / 15) + 1) * 15 : 0;
  const timeOptions = useMemo(() => {
    const label = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true });
    const out: Array<{ value: string; label: string }> = [];
    for (let m = firstMin; m < 24 * 60; m += 15) {
      const value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      out.push({ value, label: label.format(new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60))) });
    }
    return out;
  }, [firstMin, locale]);
  // Jira GRW-534 — today the empty entry shows the current time (changes once a minute), another day "Any time".
  const nowLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `nowHm` is the minute the label is for
    [locale, timezone, nowHm],
  );
  const [slots, setSlots] = useState<AvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotUtc, setSlotUtc] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);

  /**
   * The next seven days, in the salon's zone.
   *
   * Built from a midday anchor so a DST shift cannot roll a date backwards —
   * adding 24h to midnight lands on 23:00 the same day in a zone that springs
   * forward, and the chip row would then show the same date twice.
   */
  const days = useMemo(() => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    const label = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric' });
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + i);
      return { iso: fmt.format(d), label: i === 0 ? nv.today : label.format(d) };
    });
    // Jira GRW-518 — a Booking date chosen past the week is still a day on this row, and selected: it was
    // picked on the first screen, and the row must not show nothing chosen.
    if (!week.some((d) => d.iso === day)) week.push({ iso: day, label: label.format(new Date(`${day}T12:00:00`)) });
    return week;
  }, [timezone, day]);

  /*
   * Slots for the WHOLE chain, not just its first service.
   *
   * `serviceIds` repeats in the query and the API sums the chain into one span,
   * so a cut-plus-colour is only offered times where both fit on one chair.
   * Asking for the first service alone would offer 3:00 on a stylist who is
   * booked at half past, and the failure would surface as a 409 at the moment
   * of confirming — the worst possible time to find out.
   */
  useEffect(() => {
    if (!later || stage.step !== 'when' || picked.length === 0) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlotUtc(null);
    setSlotError(null);
    // Jira GRW-297 — an extra beside a combo is a real leg on the same visit
    // now, so the slot search has to fit its duration too, same reasoning as
    // the chain comment above.
    void api
      .availability([...picked, ...extras].map((p) => p.serviceId), day, schedulableId ?? 'any', listBranch)
      .then((r) => {
        if (cancelled) return;
        setSlots(r);
        // Jira GRW-341 — a time picked on the Book again card. This effect clears the choice when it starts, so it
        // is put back here, once, and only if that time is still on the list.
        const wanted = pendingSlot.current;
        pendingSlot.current = null;
        if (wanted && r.sections.some((sec) => sec.slots.some((sl) => sl.utc === wanted))) setSlotUtc(wanted);
        // Jira GRW-527 — the time asked for on the first screen: that slot if it is free, else the first free one
        // after it. Nothing is selected if nothing later is free (the desk picks).
        else if (timeWantedRef.current) {
          const hm = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
          const next = r.sections.flatMap((sec) => sec.slots).find((sl) => hm.format(new Date(sl.utc)) >= timeWantedRef.current);
          if (next) setSlotUtc(next.utc);
        }
      })
      .catch(() => {
        if (!cancelled) setSlots(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [later, stage.step, day, picked, extras, schedulableId, listBranch, timezone]);

  /*
   * GRW-198 — who is in each chair, refreshed while the sheet is open.
   *
   * A salon moves: by the time the receptionist has found the client and
   * picked a service, a chair may have freed. Re-read on entering the stylist
   * step rather than once on open, so the answer is current at the moment it
   * is acted on. Walk-ins only — "later" is a question about a different day.
   */
  const [chairs, setChairs] = useState<ChairNow[]>([]);

  // Jira GRW-235 — only this branch's people, when there is a branch to choose.
  const branchProviders = useMemo(
    () => (providers ?? []).filter((p) => !listBranch || !p.locationId || p.locationId === listBranch),
    [providers, listBranch],
  );
  /**
   * Jira GRW-456 — a branch with nobody on its team yet.
   *
   * "Whoever is free" was still offered there, and still chosen by default, with nobody to be free: every save
   * through it came back 400 "No staff member can perform that service", and the refusal did not say what to do
   * instead. On a new branch — exactly where a desk is most likely to be taking its first payment — that was the
   * whole screen's answer.
   *
   * `providers` is `null` until the roster has arrived, which is not the same as an empty one, so the sentence
   * and the chip only change once there is a real answer.
   */
  const noStaffHere = providers !== null && branchProviders.length === 0;

  /**
   * Jira GRW-461 — and of those, the ones who can do what was picked.
   *
   * The walk-in write chooses the chair with `listProvidersForService` on the FIRST picked service and
   * refuses when nobody comes back. This sheet never asked, so at a branch where Nisha does hair and the desk
   * picked Hair Botox it offered Nisha, said "1 free", and the save answered 400.
   *
   * The first service only, matching the write exactly: a multi-service walk-in runs on one chair and is
   * sorted out at checkout, so asking for somebody who can do the whole basket would refuse visits the server
   * would have accepted — a disagreement in the other direction.
   *
   * `null` is "not asked yet or not answered", never "nobody": a failed call must not empty the chair list.
   */
  const [skilled, setSkilled] = useState<Set<string> | null>(null);
  const firstServiceId = picked[0]?.serviceId ?? null;

  useEffect(() => {
    if (later || !firstServiceId) {
      setSkilled(null);
      return;
    }
    let cancelled = false;
    setSkilled(null);
    void api
      .providers({ service: firstServiceId, location: listBranch })
      .then((rows) => {
        if (!cancelled) setSkilled(new Set(rows.map((p) => p.id)));
      })
      .catch(() => {
        if (!cancelled) setSkilled(null);
      });
    return () => {
      cancelled = true;
    };
  }, [later, firstServiceId, listBranch]);

  /** The chairs actually on offer: this branch's people, narrowed to the ones who can do it once that is known. */
  const ableProviders = skilled === null ? branchProviders : branchProviders.filter((p) => skilled.has(p.id));

  /** Jira GRW-461 — staff here, but none of them can do this. Distinct from `noStaffHere`, which is nobody at all. */
  const noOneCanDoIt = skilled !== null && branchProviders.length > 0 && ableProviders.length === 0;

  // The chairs, and the free count, counted over the people actually on offer (GRW-461 narrowed that set):
  // "2 free" must never include somebody who cannot do the thing that was picked.
  const branchChairs = chairs.filter((c) => ableProviders.some((p) => p.id === c.schedulableId));
  const freeCount = branchChairs.length > 0 ? branchChairs.filter((c) => c.free).length : null;

  /*
   * Jira GRW-461 — a stylist chosen before the service changed under them.
   *
   * Swapping the first service re-asks who can do it, and the person already picked may not be on the new
   * answer. Leaving them selected would be a pick the save refuses, which is the whole defect.
   */
  useEffect(() => {
    if (!schedulableId || skilled === null) return;
    if (!skilled.has(schedulableId)) setSchedulableId(null);
  }, [schedulableId, skilled]);
  /*
   * Record payment can still be settled: it is a sale at the counter, which is what "No stylist" (GRW-293) is
   * for. So that becomes the choice rather than a chip that can only be refused.
   */
  useEffect(() => {
    if (forPayment && noStaffHere) setNoStylist(true);
  }, [forPayment, noStaffHere]);

  /**
   * Jira GRW-458 — nobody can take them now: every chair busy, or no chairs at this branch at all.
   *
   * This decides which of the two outcomes leads, so it must not fire on a half-loaded screen. `freeCount`
   * is `null` while the chair list is on its way, which is not the same answer as zero; `noStaffHere` above
   * carries the same care about `providers`, which is why it is read rather than re-derived.
   */
  const noChairFree = freeCount === 0 || noStaffHere || noOneCanDoIt;

  useEffect(() => {
    if (later || stage.step !== 'details') return;
    let cancelled = false;
    void api
      .chairs()
      .then((r) => {
        if (!cancelled) setChairs(r.chairs);
      })
      .catch(() => {
        // The chips fall back to bare names, which is what they were before.
        if (!cancelled) setChairs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [later, stage.step]);

  const [loadingCheckout, setLoadingCheckout] = useState(false);

  /**
   * Fetch the visit's real rows, then open the till.
   *
   * `api.appointments` is scoped to this client and today, then narrowed to the
   * exact leg ids this walk-in created — a client who already had a booking
   * earlier today must not have it swept into this checkout.
   *
   * Ordered by the legs' own order, not the API's, because the first row is the
   * one checkout settles and the others ride along as group members.
   */
  const openCheckout = async (result: WalkInDone) => {
    setLoadingCheckout(true);
    setCheckoutError(null);
    setTillClosedUnpaid(false);
    try {
      /*
       * Today AND tomorrow — a late visit runs past midnight.
       *
       * This asked for `today, today`, and QA found what that costs: a walk-in
       * recorded at 22:02 for Balayage + Haircut + Beard Trim put two of its
       * three legs after local midnight, so the fetch returned one row and the
       * till opened on the Balayage alone. ₹450 was never charged and those two
       * legs stayed `confirmed` forever — ghost bookings on tomorrow's calendar.
       *
       * It failed SILENTLY, which is the worse half: the guard below only fired
       * on an EMPTY result, so a partial one read as success.
       */
      const zoned = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
      const now = new Date();
      const all = await api.appointments(
        zoned(now),
        zoned(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
        undefined,
        result.customerId,
      );
      const byId = new Map(all.map((a) => [a.id, a]));
      const rows = result.legIds.map((id) => byId.get(id)).filter((a): a is Appointment => Boolean(a));

      /*
       * Every leg, or none — a partial till is worse than no till.
       *
       * Settling 1 of 3 legs takes a third of the money and leaves the rest
       * uncompleted with nothing on screen to say so. Refusing sends the
       * receptionist to Bookings, where the whole visit is visible and
       * settleable.
       */
      if (rows.length !== result.legIds.length) throw new Error(nv.tillFailed);
      setCheckoutRows(rows);
    } catch (error) {
      /*
       * Jira GRW-289 — only a sentence the API wrote reaches the screen.
       *
       * This passed on the message of ANY `Error`, and a dropped
       * connection IS an Error, so QA read the browser's raw "Failed to fetch"
       * instead of the copy below — the same mistake `submit` documents fixing
       * for the walk-in save. A 5xx, or a 4xx with no body, carries only
       * "/api/v1/appointments failed: 500", which is not for a receptionist
       * either. The "every leg, or none" guard above throws `tillFailed` itself,
       * so it lands here too.
       */
      setCheckoutError(
        error instanceof ApiError && error.status < 500 && error.code ? error.message : nv.tillFailed,
      );
    } finally {
      setLoadingCheckout(false);
    }
  };

  /**
   * Jira GRW-222 — into the waiting queue instead of a chair.
   *
   * For a busy salon where nobody is free yet: the person is standing at the
   * desk, so this IS their arrival, and "Give to staff" on Home starts the visit
   * later. The same attempt key as a walk-in, so a retried tap is one place in
   * line.
   */
  /**
   * Jira GRW-290 — this visit's rows as the API has them now. The fetch
   * window is today and tomorrow for the same reason `openCheckout` gives: a
   * late visit's legs can run past local midnight.
   */
  const visitRows = async (visit: WalkInDone): Promise<Appointment[]> => {
    const zoned = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
    const now = new Date();
    const all = await api.appointments(zoned(now), zoned(new Date(now.getTime() + 24 * 60 * 60 * 1000)), undefined, visit.customerId);
    const byId = new Map(all.map((a) => [a.id, a]));
    return visit.legIds.map((id) => byId.get(id)).filter((a): a is Appointment => Boolean(a));
  };

  /**
   * Jira GRW-290 — settle the visit with the amounts and mode on this screen.
   *
   * One checkout: the first leg is the appointment and the rest ride along as
   * group members, exactly as the till did. Lines and legs are in the same
   * order — `recordWalkIn` writes one leg per `serviceIds` entry, in order.
   *
   * A 409 is checkout refusing a visit that is no longer `confirmed`. After a
   * lost response that is OUR first attempt having succeeded, so the rows are
   * read back: every leg completed means paid, and it is shown as paid rather
   * than as an error that invites a third try.
   */
  const payFor = async (client: PickedClient, visit: WalkInDone) => {
    const amounts = picked.map((item) => rupeesToMinor(item.paidRupees) ?? 0);
    const [first, ...rest] = visit.legIds;
    if (!first || visit.legIds.length !== amounts.length) {
      setStage({ step: 'error', client, message: nv.paymentNotSaved });
      return;
    }
    /*
     * Jira GRW-292 — whatever was added beside a combo goes in as
     * `extraServices`: new rows on this same visit, checkout's own
     * mechanism for something sold in the chair beyond what was booked.
     * `checkoutAppointment` refuses the whole request unless `first` is
     * still `confirmed`, so a retry either creates these exactly once or
     * not at all — nothing here needs its own idempotency key.
     */
    const extraServices = extras.map((item) => ({
      serviceId: item.serviceId,
      paidAmountMinor: rupeesToMinor(item.paidRupees) ?? 0,
    }));
    try {
      await guardLargeAmount((confirmed) =>
        api.checkout(first, {
          paidAmountMinor: amounts[0],
          paymentMode,
          groupMembers: rest.map((appointmentId, i) => ({ appointmentId, paidAmountMinor: amounts[i + 1]! })),
          ...(extraServices.length > 0 ? { extraServices } : {}),
          ...(confirmed ? { confirmLargeAmount: true } : {}),
        }),
      );
    } catch (error) {
      if (error instanceof LargeAmountDeclined) {
        setStage({ step: 'error', client, message: nv.amountNotSaved });
        return;
      }
      const settled =
        error instanceof BookingConflictError &&
        (await visitRows(visit)
          .then((rows) => rows.length === visit.legIds.length && rows.every((r) => r.status === 'completed'))
          .catch(() => false));
      if (!settled) {
        setStage({
          step: 'error',
          client,
          message: error instanceof ApiError && error.status < 500 ? error.message : nv.paymentNotSaved,
        });
        return;
      }
    }
    router.refresh();
    setStage({
      step: 'paid',
      client,
      result: visit,
      totalMinor: amounts.reduce((a, b) => a + b, 0) + extraServices.reduce((sum, e) => sum + e.paidAmountMinor, 0),
      mode: paymentMode,
    });
  };

  const queueIt = async (client: PickedClient) => {
    // Jira GRW-284 — no services is fine: a token by name alone, services at payment.
    setStage({ step: 'saving', client });
    try {
      const entry = await api.addToQueue({
        ...(client.kind === 'existing'
          ? { customerId: client.id }
          : { customerName: client.name, ...(client.phone ? { customerPhone: client.phone } : {}) }),
        serviceIds: [...picked, ...extras].map((p) => p.serviceId),
        ...(offerId ? { offerId } : {}),
        idempotencyKey: attemptKey,
        // Jira GRW-244 — they wait at the branch picked above, not at the main one.
        ...atBranch,
      });
      router.refresh();
      setStage({ step: 'queued', client, tokenNo: entry.tokenNo });
    } catch (error) {
      setStage({ step: 'error', client, message: error instanceof ApiError ? error.message : nv.saveUnknown });
    }
  };

  const submit = async (client: PickedClient) => {
    if (picked.length === 0) return;
    if (later && !slotUtc) return;
    setStage({ step: 'saving', client });
    try {
      if (later) {
        const booked = await api.createBooking({
          ...(client.kind === 'existing'
            ? { customerId: client.id }
            : { customerName: client.name, customerPhone: client.phone }),
          // Jira GRW-297 — an extra beside a combo books as its own leg,
          // priced at its own service's list price; the server only prices
          // the combo's own legs off `offerId`.
          serviceIds: [...picked, ...extras].map((p) => p.serviceId),
          ...(offerId ? { offerId } : {}),
          startAt: slotUtc!,
          ...(schedulableId ? { schedulableId } : {}),
          ...atBranch,
        });
        router.refresh();
        setStage({
          step: 'done',
          client,
          result: {
            appointmentId: booked.appointmentId,
            customerId: booked.customerId,
            legIds: booked.appointmentIds,
            schedulableId: booked.schedulableId,
            startAt: booked.startAt,
            overlapping: false,
          },
        });
        return;
      }

      /*
       * Jira GRW-293 (epic GRW-283) — "No stylist": one call, born paid,
       * born settled. Not the `createWalkIn` + `payFor` pair below — there is
       * no chair to walk in to, and `recordCounterSale`'s whole point is that
       * it never writes a hold or an allocation. `noStylist` can only be true
       * under `forPayment` (the chip only renders there), so this is checked
       * before the `savedVisit` retry path, which is that pair's own concern.
       */
      /*
       * Jira GRW-403 — paying a waiting token. One call whoever did it: the counter sale records the visit (with
       * that stylist, or with nobody) and closes the token, retry-safe on the same key. No `location`: the visit is
       * at the branch the token was issued at, and the server says so.
       */
      if (paysToken) {
        const lines = [...picked, ...extras].map((item) => ({
          serviceId: item.serviceId,
          paidAmountMinor: rupeesToMinor(item.paidRupees) ?? 0,
        }));
        const result = await guardLargeAmount((confirmed) =>
          api.recordCounterSale({
            queueEntryId: paysToken.id,
            services: lines,
            ...(offerId ? { offerId } : {}),
            ...(noStylist || !schedulableId ? { noStylist: true as const } : { schedulableId }),
            paymentMode,
            idempotencyKey: attemptKey,
              ...(confirmed ? { confirmLargeAmount: true } : {}),
          }),
        );
        router.refresh();
        setStage({
          step: 'paid',
          client,
          result: {
            appointmentId: result.appointmentId,
            customerId: result.customerId,
            legIds: result.legs.map((l) => l.appointmentId),
            schedulableId: result.schedulableId,
            startAt: result.startAt,
            overlapping: result.overlapping,
            tokenNo: result.tokenNo ?? paysToken.tokenNo,
          },
          totalMinor: result.legs.reduce((sum, l) => sum + l.paidAmountMinor, 0),
          mode: paymentMode,
        });
        return;
      }

      if (forPayment && noStylist) {
        const services = [...picked, ...extras].map((item) => ({
          serviceId: item.serviceId,
          paidAmountMinor: rupeesToMinor(item.paidRupees) ?? 0,
        }));
        const result = await guardLargeAmount((confirmed) =>
          api.recordCounterSale({
            ...(client.kind === 'existing'
              ? { customerId: client.id }
              : { customerName: client.name, ...(client.phone ? { customerPhone: client.phone } : {}) }),
            services,
            ...(offerId ? { offerId } : {}),
            noStylist: true,
            paymentMode,
            idempotencyKey: attemptKey,
            ...atBranch,
              ...(confirmed ? { confirmLargeAmount: true } : {}),
          }),
        );
        router.refresh();
        setStage({
          step: 'paid',
          client,
          result: {
            appointmentId: result.appointmentId,
            customerId: result.customerId,
            legIds: result.legs.map((l) => l.appointmentId),
            schedulableId: null,
            startAt: result.startAt,
            overlapping: false,
            tokenNo: result.tokenNo,
          },
          totalMinor: result.legs.reduce((sum, l) => sum + l.paidAmountMinor, 0),
          mode: paymentMode,
        });
        return;
      }

      if (forPayment && savedVisit) {
        await payFor(client, savedVisit);
        return;
      }

      const result = await api.createWalkIn({
        ...(client.kind === 'existing'
          ? { customerId: client.id }
          : { customerName: client.name, ...(client.phone ? { customerPhone: client.phone } : {}) }),
        /*
         * Jira GRW-297 — plain Walk-in now books an extra as its own leg,
         * same reasoning as `later` above. Record payment (forPayment) does
         * NOT merge it here: `payFor` below settles it through checkout's
         * own `extraServices`, unrelated to `offerId`/combo pricing, so
         * folding it into this call would book — and pay for — it twice.
         */
        serviceIds: (forPayment ? picked : [...picked, ...extras]).map((p) => p.serviceId),
        ...(offerId ? { offerId } : {}),
        ...(schedulableId ? { schedulableId } : {}),
        ...(reclaim && schedulableId ? { reclaimAppointmentId: reclaim } : {}),
        ...atBranch,
        idempotencyKey: attemptKey,
      });
      router.refresh();
      const recorded: WalkInDone = {
        appointmentId: result.appointmentId,
        customerId: result.customerId,
        legIds: result.legs.map((l) => l.appointmentId),
        schedulableId: result.schedulableId,
        startAt: result.startAt,
        overlapping: result.overlapping,
        tokenNo: result.tokenNo,
      };
      /*
       * Jira GRW-290 — Record payment settles on this screen: no till, no
       * "Recorded" stop. The visit is remembered first, so a failed payment
       * is retried against it and never records a second visit.
       */
      if (forPayment) {
        setSavedVisit(recorded);
        await payFor(client, recorded);
        return;
      }
      setStage({ step: 'done', client, result: recorded });
    } catch (error) {
      // Jira GRW-480 — "Check again" on a large amount: nothing was saved, and the sheet says so.
      if (error instanceof LargeAmountDeclined) {
        setStage({ step: 'error', client, message: nv.amountNotSaved });
        return;
      }
      /*
       * Only the API's own message reaches the receptionist.
       *
       * This read `error instanceof Error ? error.message : …`, and a dropped
       * connection IS an Error — so a network failure showed the raw browser
       * string "Failed to fetch" and the written copy was never seen. Worse,
       * `saveFailed` says "That did not save… try again", which after a lost
       * RESPONSE is false and instructs the retry that duplicates the visit.
       *
       * `ApiError` means the server answered and explained itself; anything
       * else means we do not know whether it saved, and must say so.
       */
      /*
       * A taken slot is not an error to read, it is a slot to re-pick.
       *
       * `BookingConflictError` is any 409, which for an advance booking means
       * the time went while the receptionist was typing. Dropping them back on
       * the time step with the list refreshed is the scripted recovery; leaving
       * them on an error screen would make them start the client over.
       */
      // Jira GRW-478 — only a lost slot; any other 409 (a client mid-erasure, a repeated request) is a sentence to read.
      if (later && error instanceof BookingConflictError && error.code === 'slot_taken') {
        setSlotUtc(null);
        setSlots(null);
        setStage({ step: 'when', client });
        setCheckoutError(null);
        setSlotError(nv.slotTaken);
        return;
      }
      setStage({
        step: 'error',
        client,
        message: error instanceof ApiError ? error.message : nv.saveUnknown,
      });
    }
  };

  if (checkoutRows && checkoutRows.length > 0 && services && providers) {
    /*
     * Straight into the existing till. Revenue is the owner's third outcome and
     * `CheckoutSheet` is the only money-entry UI in the app — inventing a
     * second one inside this sheet would be two save models for one number.
     *
     * The first leg is the appointment being settled and the rest are its
     * group members, exactly the shape a combo booked through WhatsApp arrives
     * in, so checkout needs no idea a walk-in is different.
     */
    const [first, ...rest] = checkoutRows;
    return (
      <CheckoutSheet
        appointment={first!}
        services={services}
        // Jira GRW-392 (review) — this visit's branch's people: another branch's stylist is refused at the till.
        providers={branchProviders}
        offers={offers ?? []}
        groupMembers={rest}
        timezone={timezone}
        onBack={() => {
          setCheckoutRows(null);
          setTillClosedUnpaid(true);
        }}
        onSaved={() => {
          setCheckoutRows(null);
          onClose();
        }}
        onClose={() => {
          setCheckoutRows(null);
          /*
           * Jira GRW-289 — Record payment exists to take the money; leaving the
           * till unsaved must not look like it did. Back to the done screen.
           *
           * Jira GRW-451 — unconditionally, because the condition had it backwards.
           * The till is only ever opened from the `done` screen's "Take payment
           * now", and `done` is only ever reached when `forPayment` is FALSE
           * (Record payment settles inline through `payFor` and ends on `paid`).
           * So `if (forPayment)` was dead, and the one purpose that does reach
           * the till — plain Walk-in now — took the `else`: cancelling closed
           * the whole sheet onto Bookings with a visit recorded, nothing paid
           * and nothing saying so. "Done" is still right here; this tells
           * rather than blocks, which is what GRW-289 decided.
           */
          setTillClosedUnpaid(true);
        }}
      />
    );
  }

  const busy = stage.step === 'saving';
  /** Jira GRW-290 — once a Record payment visit exists, its lines are what was written. */
  const linesLocked = forPayment && savedVisit !== null;
  const headSub =
    stage.step === 'client'
      ? nv.whoIsThis(clientNoun.toLowerCase())
      : paysToken?.tokenNo
        ? `${nv.token(paysToken.tokenNo)} · ${clientName(stage.client)}`
        : clientName(stage.client);

  const asPage = presentation === 'page';
  // Jira GRW-520 — every row the dropdown can show, in order: this branch's matches, then the other branches'.
  const comboOptions = [
    ...results.map((c) => ({ c, bring: false })),
    ...elsewhere.map((c) => ({ c, bring: true })),
  ];
  const showDrop = comboOpen && term.trim().length >= SEARCH_MIN_CHARS;
  /*
   * The title names the MODE only once the mode can no longer be changed here (owner, 2026-10-04).
   *
   * The Booking date sets it, so on arrival the screen was called "Walk-in" while the control that decides
   * walk-in-or-not was still below it, unanswered — and the owner had tapped "New booking" to get here. While
   * the date can still change the title is the screen's own name; once a client is picked it can say which of
   * the two this is, because by then it is settled.
   */
  const modeStillOpen = !forPayment && stage.step === 'client';
  const sheetTitle = forPayment ? nv.paymentTitle : modeStillOpen ? nv.pageTitle : later ? nv.laterTitle : nv.title;

  /**
   * Jira GRW-458 — Back is navigation, so it belongs beside the title, not in the tray of actions that
   * create the visit.
   *
   * It used to sit in the footer of three different steps as a ghost button, which left every tray holding
   * one button that was not an outcome: on the walk-in step that was three buttons for two outcomes, and
   * nothing in the row could be aligned without one of them looking like the odd one out.
   *
   * `null` means there is nowhere to go: mid-save, with the lines already written (GRW-290), or paying a
   * token, whose client is the token's and has no client step behind it (GRW-403).
   */
  const goBack = (() => {
    if (busy || linesLocked) return null;
    // Jira GRW-537 — the first screen of the page has Back too: through history, or Home when there is none (the
    // app's own Back, GRW-497). Not in the pop-up, which has its ✕.
    if (asPage && stage.step === 'client') {
      return () => (window.history.length > 1 ? router.back() : router.push('/'));
    }
    if ((stage.step === 'details' || stage.step === 'error') && !paysToken) {
      return () => setStage({ step: 'client' });
    }
    if (stage.step === 'when') {
      const client = stage.client;
      return () => setStage({ step: 'details', client });
    }
    return null;
  })();

  return (
    <>
      {/* Jira GRW-478 (U-4) — once a client or a service is picked, a stray tap above the sheet keeps the visit; Close shuts it. */}
      {largeAmountDialog}
      {!asPage && <div className="sheet-backdrop" onClick={busy || picked.length > 0 || newName.trim() || newPhone.trim() || stage.step !== 'client' ? undefined : onClose} />}
      <div
        className={asPage ? 'walk-in-page' : 'sheet walk-in-sheet'}
        role={asPage ? undefined : 'dialog'}
        aria-modal={asPage ? undefined : true}
        ref={sheetRef}
        aria-label={asPage ? undefined : forPayment ? nv.paymentTitle : later ? nv.laterTitle : nv.title}
      >
        {!asPage && <div className="sheet-grab" />}

        <div className="sheet-head">
          {/*
            Jira GRW-458 — the left cell is always drawn, empty when there is nowhere to go back to.

            `.sheet-head` is `grid-template-columns: 1fr auto 1fr` (98-service-sheet.css), a header built for
            a control on each side of a centred title. This sheet only ever gave it two children, so the
            title took the first cell, the close button took the MIDDLE, and the third 1fr sat empty: the ✕
            floated in the centre of the header with a column of nothing beside it. Keeping the cell holds
            the title in the middle and the ✕ on the edge, with or without a back arrow.
          */}
          {goBack ? (
            <button type="button" className="wi-back" aria-label={nv.back} onClick={goBack}>
              <IconArrowLeft />
            </button>
          ) : (
            <span className="wi-back-gap" aria-hidden="true" />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Jira GRW-342 — the routed page has no other heading; the pop-up keeps a plain div (it is named by aria-label). */}
            {asPage ? <h1 className="sheet-title">{sheetTitle}</h1> : <div className="sheet-title">{sheetTitle}</div>}
            <div className="sheet-sub">{headSub}</div>
          </div>
          <button type="button" className="wi-close" aria-label={nv.close} onClick={onClose} disabled={busy}>
            <IconClose />
          </button>
        </div>

        {/* ---------- Stage 1: find them ---------- */}
        {stage.step === 'client' && (
          <div className="wi-body" id="wi-client-panel">
            {/*
              Jira GRW-520 — a combobox: the matches float in a dropdown under the box instead of pushing the
              form down. Pointer-down on the dropdown is kept from taking focus off the input, so a tap on a row
              is not preceded by the box losing focus and the dropdown closing under the finger (iOS gives a
              button no focus, so that blur arrives with no related target).
            */}
            <div
              className="wi-combo"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setComboOpen(false);
              }}
            >
              <div className="picker-search">
                <span className="wi-search-icon">
                  <IconSearch />
                </span>
                <input
                  type="search"
                  className="wi-search-input"
                  role="combobox"
                  aria-expanded={showDrop}
                  aria-controls="wi-dropdown"
                  aria-autocomplete="list"
                  aria-activedescendant={showDrop && activeIdx >= 0 ? `wi-opt-${activeIdx}` : undefined}
                  placeholder={nv.searchPlaceholder}
                  aria-label={nv.searchPlaceholder}
                  value={term}
                  autoFocus
                  onFocus={() => setComboOpen(true)}
                  onKeyDown={(e) => {
                    if (!showDrop) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveIdx((i) => (comboOptions.length === 0 ? -1 : (i + 1) % comboOptions.length));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveIdx((i) => (comboOptions.length === 0 ? -1 : i <= 0 ? comboOptions.length - 1 : i - 1));
                    } else if (e.key === 'Enter' && activeIdx >= 0 && comboOptions[activeIdx]) {
                      e.preventDefault();
                      const o = comboOptions[activeIdx];
                      if (o.bring) bringHere(o.c);
                      else pickClient(o.c);
                    } else if (e.key === 'Escape') {
                      // Closes the dropdown, not the sheet: stopped here, before the dialog's own listener.
                      e.preventDefault();
                      e.stopPropagation();
                      setComboOpen(false);
                    }
                  }}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTerm(v);
                    setComboOpen(true);
                    setActiveIdx(-1);
                    // Jira GRW-514 — seed the add block below, unless the desk has typed in it.
                    const typed = v.trim();
                    if (digitsOf(typed).length >= 7) {
                      if (!phoneEdited.current) setNewPhone(typed);
                    } else if (!nameEdited.current) {
                      setNewName(typed);
                    }
                  }}
                />
                {term !== '' && (
                  <button type="button" className="search-clear-btn" onClick={() => setTerm('')} aria-label={nv.clear}>
                    ✕
                  </button>
                )}
              </div>

              {showDrop ? (
                <div
                  className="wi-dropdown"
                  id="wi-dropdown"
                  role="listbox"
                  aria-label={nv.searchPlaceholder}
                  onPointerDown={(e) => e.preventDefault()}
                >
                  {results.map((c, i) => (
                    <button
                      key={c.id}
                      id={`wi-opt-${i}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={activeIdx === i}
                      className={`picker-row wi-row ${activeIdx === i ? 'wi-row-active' : ''}`}
                      onClick={() => pickClient(c)}
                    >
                      <span className="picker-row-text">
                        <span className="picker-row-name">{c.name?.trim() || nv.noName}</span>
                        <span className="picker-row-meta">{clientMetaLine(c)}</span>
                      </span>
                    </button>
                  ))}
                  {!searching && results.length === 0 && elsewhere.length === 0 && <div className="empty">{nv.noMatch}</div>}

                  {/*
                    Jira GRW-454 — the same search at the other branches, kept apart from this branch's own rows
                    and below them: these are not people who can be booked here yet, they are an offer to take
                    them on.
                  */}
                  {elsewhere.length > 0 ? (
                    <>
                      <h2 className="wi-section-label" role="presentation">
                        {nv.atOtherBranches}
                      </h2>
                      {elsewhere.map((c, j) => {
                        const i = results.length + j;
                        return (
                          <button
                            key={c.id}
                            id={`wi-opt-${i}`}
                            type="button"
                            role="option"
                            tabIndex={-1}
                            aria-selected={activeIdx === i}
                            className={`picker-row wi-row ${activeIdx === i ? 'wi-row-active' : ''}`}
                            onClick={() => bringHere(c)}
                          >
                            {/* This one keeps its right-hand column: "Bring to MG Road" is the action, not a fact. */}
                            <span className="picker-row-text">
                              <span className="picker-row-name">{c.name?.trim() || nv.noName}</span>
                              <span className="picker-row-meta">{clientMetaLine(c)}</span>
                            </span>
                            <span className="picker-row-meta">{nv.bringToBranch(branchNameOf(listBranch ?? undefined) ?? '')}</span>
                          </button>
                        );
                      })}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Jira GRW-517 — no list of previous clients: a client is found by typing, or added below. */}

            {/*
              Jira GRW-514 — adding someone new is on this screen, under the search, not a button to another one.
              Jira GRW-518 — with no heading or icon of its own, and no margin above it: just the two fields.
              The old second step (name, phone, "Use this person") is these same fields and the same checks.
            */}
            <div className="wi-new-person" ref={addNewRef}>
              <div className="field">
                <label htmlFor="wi-name">{nv.nameRequired}</label>
                <input
                  id="wi-name"
                  type="text"
                  className={nameError ? 'field-invalid' : undefined}
                  value={newName}
                  placeholder={nv.namePlaceholder}
                  onChange={(e) => {
                    nameEdited.current = true;
                    setNewName(e.target.value);
                    if (nameError) setNameError(false);
                  }}
                />
                {nameError && <div role="alert" className="field-error">{nv.nameMissing}</div>}
              </div>

              {/*
                Required for an advance booking, optional for a walk-in.
                A different rule for a genuinely different situation: the person
                in front of you does not need reminding, and Saturday's customer
                cannot be reminded without a number. The label's required mark says
                which is which. No helper text under it (Jira GRW-530).
              */}
              <PhoneField
                id="wi-phone"
                label={nv.phoneRequired}
                required={later}
                value={newPhone}
                onChange={(v) => {
                  phoneEdited.current = true;
                  setNewPhone(v);
                  if (phoneError) setPhoneError(null);
                }}
                error={phoneError}
              />

              {/*
              Jira GRW-518 · GRW-519 · GRW-521 — the Booking date, last: search, name, phone, then when. It shows
              today. Today is a walk-in now; a later day is a booking for that day (and needs a phone). Never
              before today; set back to today, or cleared, it is a walk-in again.
            */}
            {/* Jira GRW-529 — date and time share one row. */}
            <div className="wi-when">
            <div className="field wi-date-field">
              <label htmlFor="wi-date">
                {nv.bookingDate}
              </label>
              <input
                id="wi-date"
                type="date"
                min={todayIso}
                value={day}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = !v || v < todayIso ? todayIso : v;
                  setDay(next);
                  setDateChosen(next > todayIso);
                  // Jira GRW-535 — a morning time chosen for tomorrow is dropped when the date comes back to today and
                  // it has passed. Only here: a clock tick never clears a time the person has just picked.
                  if (next === todayIso && timeWanted && timeWanted < nowHm) setTimeWanted('');
                }}
              />
            </div>

            {/*
              Jira GRW-527 — the Booking time, after the date. Optional: empty is a walk-in now. A time makes it a
              booking — for the date shown, so "later today" is a time on today. It is a list of quarter-hours from now (today), so a past time cannot be chosen.
            */}
            <div className="field wi-date-field">
              <label htmlFor="wi-time">
                {nv.bookingTime}
              </label>
              <select id="wi-time" value={timeWanted} onChange={(e) => setTimeWanted(e.target.value)}>
                {/* Jira GRW-534 — today the empty entry shows the current time and is still a walk-in; another day, "Any time". */}
                <option value="">
                  {day === todayIso ? nv.timeNow(nowLabel) : nv.anyTime}
                </option>
                {timeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            </div>

            {/* Jira GRW-458 — Back is in the header now; this tray holds the one action that moves forward. */}
              <div className="modal-actions wi-actions wi-acts">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!newName.trim()) {
                      setNameError(true);
                      return;
                    }
                    /*
                     * A walk-in may give no number; anyone who gives one must
                     * give a real one. A half-typed number saved as-is is the
                     * shape that produced `+91786545789` in the live data.
                     */
                    const phoneProblem = checkPhone(newPhone, { required: later });
                    if (phoneProblem) {
                      setPhoneError(phoneProblem);
                      return;
                    }
                    setStage({
                      step: 'details',
                      client: { kind: 'new', name: newName.trim(), phone: toStoredPhone(newPhone) ?? '' },
                    });
                  }}
                >
                  {nv.useThisPerson}
                </button>
                {/* Jira GRW-523 — on the page, a way out to Home under the one action that moves forward. */}
                {asPage ? (
                  <button type="button" className="btn btn-ghost wi-act-alt" onClick={() => router.push('/')}>
                    {nv.backToHome}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ---------- Stage 2: what are they having ---------- */}
        {(stage.step === 'details' || stage.step === 'saving' || stage.step === 'error') && (
          <div className="wi-body">
            {stage.step === 'error' && <div role="alert" className="wi-error">{stage.message}</div>}

            {/* Jira GRW-453 — once the branch is settled it is said, not asked: the client was picked from this
                branch's own list, and a token's visit is already at its branch. Changing it here would leave the
                client belonging to one branch and the booking to another, which the database refuses. */}
            {branchSettled && branches.length > 1 && branchNameOf(listBranch ?? undefined) ? (
              /*
               * Said in one line, not asked (owner, 2026-10-04). It was a "Which branch?" heading over a
               * single chip — a question with one possible answer, 44px of control that cannot change
               * anything, at the top of the screen. `entering-data.md` asks the opposite: pre-gather what
               * you can and ask for the rest. A one-branch salon is told nothing at all, because there is
               * nothing to tell; with branches it still matters WHICH one this booking lands at, so the
               * line stays.
               */
              <p className="wi-at-branch">{nv.atBranch(branchNameOf(listBranch ?? undefined)!)}</p>
            ) : null}

            {/* Jira GRW-379 — first, because the branch decides the menu below it. Jira GRW-453 — and only while
                it is still open to change: for a new client, who becomes a client of whichever branch is chosen. */}
            {branches.length > 1 && !branchSettled ? (
              <>
                {/* Jira GRW-522 — a dropdown, not a row of chips that wrapped to three lines with five branches. */}
                <div className="field wi-branch-field">
                  <label htmlFor="wi-branch">{nv.whichBranch}</label>
                  <select
                    id="wi-branch"
                    value={branchId ?? ''}
                    onChange={(e) => {
                      branchTouched.current = true;
                      // Its menu, stylist and chair are cleared with it (the reset beside `listBranch`).
                      setBranchId(e.target.value);
                    }}
                    disabled={busy || linesLocked}
                  >
                    {branches.map((b, i) => (
                      <option key={b.id} value={b.id}>
                        {i === 0 ? tw('mainSuffix', { name: b.name }) : b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {/* Jira GRW-341 — a returning client: last time's visit, and the next free times. */}
            {stage.step === 'details' && stage.client.kind === 'existing' && picked.length === 0 && extras.length === 0 && services && providers && offers ? (
              <BookAgainCard
                clientId={stage.client.id}
                services={services}
                providers={branchProviders}
                offers={combos}
                branchId={listBranch}
                days={days.map((d) => d.iso)}
                timezone={timezone}
                later={later}
                onUse={(plan, moveOn) => {
                  applyPlan(plan);
                  if (moveOn) setStage({ step: 'when', client: stage.client });
                }}
                onPickTime={(plan, time) => bookAgainAt(stage.client, plan, time)}
              />
            ) : null}

            {/* Chosen list first — it is the answer being assembled. */}
            {(picked.length > 0 || extras.length > 0) && (
              <>
                <h2 className="wi-section-label">{nv.picked}</h2>
                <div className="wi-picked">
                  {comboActive ? (
                    /*
                     * Jira GRW-291 — a combo is one line: what it would have
                     * cost, what it saves, and what it costs — not its
                     * services listed apart with the discount invisible
                     * between them. `applyCombo` always replaces the whole
                     * list, so `picked` here IS the combo and nothing else.
                     */
                    <div className="wi-picked-row wi-picked-combo">
                      <span className="wi-picked-name">
                        {comboTitle}
                        <span className="wi-combo-tag">{nv.combo}</span>
                      </span>
                      <span className="wi-combo-figures">
                        <span className="wi-combo-list">{formatMoney(String(comboListMinor))}</span>
                        <span className="wi-combo-save">{nv.comboSaves(formatMoney(String(comboSavingMinor)))}</span>
                        {forPayment ? (
                          <label className="wi-amount">
                            <span aria-hidden>₹</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={nv.amountFor(comboTitle ?? nv.combo)}
                              aria-invalid={rupeesToMinor(comboAmountText) === null}
                              value={comboAmountText}
                              onChange={(e) => setComboAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                              disabled={busy || linesLocked}
                            />
                          </label>
                        ) : (
                          <strong className="wi-combo-price">{formatMoney(comboPriceMinor!)}</strong>
                        )}
                      </span>
                      <button
                        type="button"
                        className="wi-remove"
                        aria-label={`${nv.removeService} ${comboTitle ?? nv.combo}`}
                        onClick={removeCombo}
                        disabled={busy || linesLocked}
                      >
                        <IconClose />
                      </button>
                    </div>
                  ) : null}
                  {/*
                   * Jira GRW-292 — whatever was added beside the combo: its
                   * own row, its own price, same markup the plain (no-combo)
                   * list below uses. Record payment settles these through
                   * `extraServices` at Mark done; Walk-in now / For later have
                   * no second step to settle them through, so the footer
                   * disables the primary button and says why while any of
                   * these sit next to a combo.
                   */}
                  {extras.map((item, i) => (
                    <div className="wi-picked-row" key={`extra-${item.serviceId}-${i}`}>
                      <span className="wi-picked-name">{item.name}</span>
                      {forPayment ? (
                        <label className="wi-amount">
                          <span aria-hidden>₹</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={nv.amountFor(item.name)}
                            aria-invalid={rupeesToMinor(item.paidRupees) === null}
                            value={item.paidRupees ?? ''}
                            onChange={(e) => setExtraAmountAt(i, e.target.value.replace(/[^0-9.]/g, ''))}
                            disabled={busy}
                          />
                        </label>
                      ) : (
                        <span className="picker-row-meta">{tmin('minutes', { count: item.durationMin })}</span>
                      )}
                      <button
                        type="button"
                        className="wi-remove"
                        aria-label={`${nv.removeService} ${item.name}`}
                        onClick={() => removeExtraAt(i)}
                        disabled={busy || linesLocked}
                      >
                        <IconClose />
                      </button>
                    </div>
                  ))}
                  {/*
                   * Jira GRW-292 — the combo row already says its own price;
                   * this total only appears once there is something ELSE to
                   * add it to, same as the plain list's total below.
                   */}
                  {comboActive && extras.length > 0 && (
                    <div className="wi-picked-total">
                      <span>{nv.total}</span>
                      <strong>{formatMoney(String(comboWithExtrasTotalMinor))}</strong>
                    </div>
                  )}
                  {!comboActive && (
                    <>
                      {picked.map((item, i) => (
                        <div className="wi-picked-row" key={`${item.serviceId}-${i}`}>
                          <span className="wi-picked-name">{item.name}</span>
                          {forPayment ? (
                            <label className="wi-amount">
                              <span aria-hidden>₹</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                aria-label={nv.amountFor(item.name)}
                                aria-invalid={rupeesToMinor(item.paidRupees) === null}
                                value={item.paidRupees ?? ''}
                                onChange={(e) => setAmountAt(i, e.target.value.replace(/[^0-9.]/g, ''))}
                                disabled={busy}
                              />
                            </label>
                          ) : (
                            <span className="picker-row-meta">{tmin('minutes', { count: item.durationMin })}</span>
                          )}
                          <button
                            type="button"
                            className="wi-remove"
                            aria-label={`${nv.removeService} ${item.name}`}
                            onClick={() => removeAt(i)}
                            disabled={busy || linesLocked}
                          >
                            <IconClose />
                          </button>
                        </div>
                      ))}
                      <div className="wi-picked-total">
                        <span>{nv.total}</span>
                        <strong>{formatMoney(forPayment ? String(paidTotalMinor) : totalMinor(picked, comboPriceMinor))}</strong>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            <h2 className="wi-section-label">
              {picked.length > 0 ? nv.addMore : nv.whichService}
            </h2>
            <div className="picker-search">
              <input
                type="search"
                className="wi-search-input wi-search-input-plain"
                placeholder={services === null ? nv.loadingServices : nv.searchServices(services.length)}
                aria-label={picked.length > 0 ? nv.addMore : nv.whichService}
                value={serviceTerm}
                onChange={(e) => setServiceTerm(e.target.value)}
                disabled={busy || linesLocked}
              />
            </div>
            <div className="picker-results wi-service-results">
              {matchingCombos.map((o) => (
                <button
                  key={`combo-${o.id}`}
                  type="button"
                  className="picker-row wi-row"
                  onClick={() => applyCombo(o)}
                  disabled={busy || linesLocked}
                >
                  <span className="picker-row-name">
                    {o.title} <span className="wi-combo-tag">{nv.combo}</span>
                  </span>
                  <span className="picker-row-meta">
                    {o.comboPriceMinor ? formatMoney(o.comboPriceMinor) : nv.comboServices(o.serviceIds.length)}
                  </span>
                </button>
              ))}
              {filteredServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="picker-row wi-row"
                  onClick={() => addService(s)}
                  disabled={busy || linesLocked}
                >
                  <span className="picker-row-name">{s.name}</span>
                  <span className="picker-row-meta">
                    {tmin('minutes', { count: s.durationMin })} · {formatMoney(s.priceMinor)}
                  </span>
                </button>
              ))}
              {services === null ? (
                <div className="empty">{nv.loadingServices}</div>
              ) : services.length === 0 ? (
                // Jira GRW-384 (AC-03) — a branch opened with an empty menu says so, and the owner is shown where
                // to add or copy one; anyone else is told plainly why nothing is listed.
                branchNameOf(listBranch ?? undefined) ? (
                  <div className="empty">
                    {nv.noServicesAtBranch(branchNameOf(listBranch ?? undefined)!, servicesNoun.toLowerCase())}{' '}
                    {/* Jira GRW-409 — a link to the Services screen for whoever the nav offers it to (the shared rule), not `isOwner`. */}
                    {canSee('/services', session?.role as MemberRole | null | undefined) ? <Link href={`/services?branch=${listBranch}`}>{nv.addOrCopyServices(servicesNoun.toLowerCase())}</Link> : null}
                  </div>
                ) : (
                  <div className="empty">{nv.noServicesYet}</div>
                )
              ) : (
                filteredServices.length === 0 &&
                matchingCombos.length === 0 &&
                alsoTry.length === 0 && <div className="empty">{nv.noServiceMatch}</div>
              )}
            </div>

            {alsoTry.length > 0 && (
              <div className="wi-also-try">
                <span className="wi-also-try-label">{nv.alsoTry}</span>
                <div className="wi-chips">
                  {alsoTry.map((s) => (
                    <button key={s.id} type="button" className="wi-chip" onClick={() => addService(s)} disabled={busy || linesLocked}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Combos replace the whole list rather than appending to it — a
                combo is priced as a unit, so half of one is not a thing. */}
            {combos.length > 0 && serviceTerm.trim() === '' && (
              <>
                <h2 className="wi-section-label">{nv.combos}</h2>
                <div className="wi-chips">
                  {combos.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={`wi-chip wi-chip-combo ${offerId === o.id ? 'wi-chip-on' : ''}`}
                      onClick={() => applyCombo(o)}
                      disabled={busy || linesLocked}
                    >
                      {o.title}
                      <span className="wi-chip-meta">
                        {o.comboPriceMinor
                          ? formatMoney(o.comboPriceMinor)
                          : nv.comboServices(o.serviceIds.length)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <h2 className="wi-section-label" id="wi-stylist-label">{nv.withWhom(providerNoun.toLowerCase())}</h2>
            {/*
              GRW-198 — chairs, not a list of names.
              The receptionist's question is "who can take this person", and a
              bare list of stylists asked them to guess: three of the five might
              be mid-haircut. Each chair now says what it is doing, and the one
              whose customer never turned up says so where the decision is made
              rather than in a banner afterwards. Only for a walk-in — "later"
              is about a day that has not happened.
            */}
            {/*
              Jira GRW-524 — a dropdown, not a card per stylist. What each chair is doing (GRW-198) moves into the
              option's own words, so the desk still sees who is free where the choice is made.
              Jira GRW-293 (epic GRW-283) — "No stylist", Record payment only. `noStylist` and `schedulableId === null`
              used to mean the same thing ("whoever is free"); they are now two different choices, so each option
              also clears `noStylist` when it is not the one picked.
              Jira GRW-403 — "Whoever is free" is not for a token: the work is done, so it is somebody named, or
              nobody. Jira GRW-456 — and not at a branch with nobody on it: "free" needs somebody to be free.
              Jira GRW-461 — only the people who can do what was picked; the save asks the same question.
            */}
            <select
              id="wi-stylist"
              className="wi-stylist-select"
              aria-labelledby="wi-stylist-label"
              value={noStylist ? WI_NO_STYLIST : (schedulableId ?? WI_WHOEVER)}
              onChange={(e) => {
                const v = e.target.value;
                setReclaim(null);
                if (v === WI_NO_STYLIST) {
                  setSchedulableId(null);
                  setNoStylist(true);
                } else if (v === WI_WHOEVER) {
                  setSchedulableId(null);
                  setNoStylist(false);
                } else {
                  setSchedulableId(v);
                  setNoStylist(false);
                }
              }}
              disabled={busy || linesLocked}
            >
              {forPayment && <option value={WI_NO_STYLIST}>{noProviderWord}</option>}
              {!paysToken && !noStaffHere && !noOneCanDoIt && (
                <option value={WI_WHOEVER}>
                  {!later && freeCount !== null ? `${nv.whoeverIsFree} · ${nv.freeCount(freeCount)}` : nv.whoeverIsFree}
                </option>
              )}
              {ableProviders.map((p) => {
                const chair = later ? null : chairs.find((c) => c.schedulableId === p.id);
                const state = !chair
                  ? ''
                  : chair.free
                    ? nv.chairFree
                    : nv.chairBusy(chair.occupant?.customerName ?? nv.someone, formatTime(chair.occupant!.freesAt, timezone));
                return (
                  <option key={p.id} value={p.id}>
                    {state ? `${p.displayName} · ${state}` : p.displayName}
                  </option>
                );
              })}
            </select>

            {/*
              The action the overlap banner never offered.
              Only on a chair whose booking has started, is still open, and is past the grace period — at 2:00 a
              4:00 booking is the future, not an absence, and offering to take it invites destroying a booking by
              misreading a row. Shown under the dropdown for the stylist chosen in it.
            */}
            {(() => {
              const chair = later || !schedulableId ? null : chairs.find((c) => c.schedulableId === schedulableId);
              const occ = chair?.occupant;
              if (!occ?.couldBeANoShow) return null;
              return (
                <button
                  type="button"
                  className={`wi-reclaim ${reclaim === occ.appointmentId ? 'is-on' : ''}`}
                  onClick={() => setReclaim(reclaim === occ.appointmentId ? null : occ.appointmentId)}
                  disabled={busy || linesLocked}
                >
                  {reclaim === occ.appointmentId
                    ? nv.reclaimOn(occ.customerName ?? nv.someone)
                    : nv.reclaimOffer(occ.customerName ?? nv.someone, occ.startedMinAgo)}
                </button>
              );
            })()}

            {/*
              Jira GRW-456 — a branch with nobody on it says so here, where the choice is, rather than leaving
              the desk to read "No staff member can perform that service" after pressing the one button there
              was. Record payment still has an answer — the sale is taken with no one against it — so it is told
              that too; a walk-in has none, and its button is off below.
            */}
            {noStaffHere ? (
              <div className="empty">
                {branchNameOf(listBranch ?? undefined)
                  ? nv.noStaffAtBranch(branchNameOf(listBranch ?? undefined)!, providerNoun.toLowerCase())
                  : nv.noStaffYet(providerNoun.toLowerCase())}{' '}
                {forPayment ? nv.stillTakePayment(noProviderWord.toLowerCase()) : null}{' '}
                {/* Jira GRW-409 — the Staff screen for whoever the nav offers it to, by the shared rule. */}
                {canSee('/providers', session?.role as MemberRole | null | undefined) ? (
                  <Link href={`/providers?branch=${listBranch}`}>{nv.addStaff(providerNoun.toLowerCase())}</Link>
                ) : null}
              </div>
            ) : null}

            {/*
              Jira GRW-461 — the branch has people, and none of them do this one.

              Said here rather than left to the save, which answers "No staff member can perform that
              service" after the press. The service is named because that is what the desk can act on —
              change the service, or give this person the skill.
            */}
            {noOneCanDoIt ? (
              <div className="empty">
                {nv.noOneDoes(picked[0]?.name ?? '', providerNoun.toLowerCase())}{' '}
                {forPayment ? nv.stillTakePayment(noProviderWord.toLowerCase()) : null}{' '}
                {canSee('/providers', session?.role as MemberRole | null | undefined) ? (
                  <Link href={`/providers?branch=${listBranch}`}>{nv.whoDoesWhat(providerNoun.toLowerCase())}</Link>
                ) : null}
              </div>
            ) : null}

            {picked.length > 0 && !later && !forPayment && (
              <div className="wi-summary">{nv.startsNow(totalMinutes([...picked, ...extras]))}</div>
            )}

            <div className={`modal-actions wi-actions wi-acts ${forPayment ? 'wi-pay-actions' : ''}`}>
              {/*
                Jira GRW-290 — the payment mode lives in the pinned footer, not
                the scrolling body. On a phone the body scrolls, and chips above
                the footer ended up half-hidden behind it: the one choice that
                goes with Mark done has to be on screen with Mark done.
              */}
              {forPayment && (
                <div className="wi-pay-modes" role="radiogroup" aria-label={nv.howPaid}>
                  <span className="wi-pay-modes-label">{nv.howPaid}</span>
                  <div className="wi-chips">
                    {PAYMENT_MODES.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        role="radio"
                        aria-checked={paymentMode === m.value}
                        className={`wi-chip ${paymentMode === m.value ? 'wi-chip-on' : ''}`}
                        onClick={() => setPaymentMode(m.value)}
                        disabled={busy}
                      >
                        {tcr(`pay.${m.value}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                /*
                 * Jira GRW-458 — the tray holds outcomes, and the one this branch can actually honour
                 * comes LAST: the bottom of the stack on a phone, the right of the row on a desktop,
                 * filled in either. (Back left for the header; GRW-403's "a token has no client step
                 * behind it" is decided there now, with the rest of the going-back.)
                 *
                 * When every chair is busy, the queue IS the answer. Leaving "Start now" as the big
                 * green button there offers something the branch cannot do — GRW-456 had to disable it
                 * outright at a branch with no staff, which is the screen admitting it put the wrong
                 * thing first. So the two swap places and "Start now anyway" steps back.
                 *
                 * The swap is a reorder of these two elements, never `order` in CSS: GRW-451 is why the
                 * eye and Tab have to be given one sequence, not two.
                 */
                const queueOffered = !later && !reclaim && !forPayment;
                const queueLeads = queueOffered && noChairFree;
                const go = (
                  <button
                    key="go"
                    type="button"
                    className={queueLeads ? 'btn btn-ghost wi-act-alt' : 'btn'}
                    onClick={() =>
                      later ? setStage({ step: 'when', client: stage.client }) : void submit(stage.client)
                    }
                    // Jira GRW-456 — a walk-in needs a chair and there is none; the queue beside it still takes them.
                    disabled={
                      busy ||
                      picked.length === 0 ||
                      (forPayment && !amountsValid) ||
                      (!later && !forPayment && (noStaffHere || noOneCanDoIt))
                    }
                  >
                    {busy
                      ? nv.saving
                      : later
                        ? nv.next
                        : forPayment
                          ? nv.markDone
                          : queueLeads
                            ? nv.startAnyway
                            : nv.start}
                  </button>
                );
                if (!queueOffered) return go;
                const queue = (
                  <button
                    key="queue"
                    type="button"
                    className={queueLeads ? 'btn wi-queue-btn' : 'btn btn-ghost wi-act-alt wi-queue-btn'}
                    onClick={() => void queueIt(stage.client)}
                    disabled={busy || linesLocked}
                  >
                    {nv.addToQueue}
                  </button>
                );
                return queueLeads ? [go, queue] : [queue, go];
              })()}
            </div>
          </div>
        )}

        {/* ---------- Stage 2b (`later` only): when ---------- */}
        {stage.step === 'when' && (
          <div className="wi-body">
            {slotError && <div role="alert" className="wi-error">{slotError}</div>}
            <h2 className="wi-section-label">{nv.whichDay}</h2>
            <div className="wi-chips" role="group" aria-label={nv.whichDay}>
              {days.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  aria-pressed={day === d.iso}
                  className={`wi-chip ${day === d.iso ? 'wi-chip-on' : ''}`}
                  onClick={() => setDay(d.iso)}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <h2 className="wi-section-label">{nv.whichTime}</h2>
            {loadingSlots ? (
              <div className="empty">{nv.loadingTimes}</div>
            ) : !slots || slots.slotCount === 0 ? (
              <div className="empty" id="wi-no-times">
                {nv.noTimes}
              </div>
            ) : (
              /*
               * Times as a grid, not the ragged wrap the free-times screen
               * uses. That page lays slots out with `flex-wrap`, so each card
               * sizes to its own text and "9:00 AM" and "10:30 AM" produce
               * columns that do not line up. Equal columns are easier to scan
               * and the whole point of this screen is scanning.
               */
              <div className="wi-slot-grid" role="group" aria-label={nv.whichTime}>
                {slots.sections.flatMap((sec) =>
                  sec.slots.map((slot) => (
                    <button
                      key={slot.utc}
                      type="button"
                      aria-pressed={slotUtc === slot.utc}
                      className={`wi-slot ${slotUtc === slot.utc ? 'wi-slot-on' : ''}`}
                      onClick={() => setSlotUtc(slot.utc)}
                    >
                      {slot.local}
                    </button>
                  )),
                )}
              </div>
            )}

            {slotUtc && (
              <div className="wi-summary">
                {everythingNamed} · {tmin('minutes', { count: totalMinutes(everything) })}
              </div>
            )}

            {/* Jira GRW-458 — Back is in the header now; this tray holds the one action that books the visit. */}
            <div className="modal-actions wi-actions wi-acts">
              <button
                type="button"
                className="btn"
                onClick={() => void submit(stage.client)}
                disabled={!slotUtc}
                aria-describedby={!slots || slots.slotCount === 0 ? 'wi-no-times' : undefined}
              >
                {nv.bookIt}
              </button>
            </div>
          </div>
        )}

        {/* ---------- Stage 3a: waiting in the queue (Jira GRW-222) ---------- */}
        {stage.step === 'queued' && (
          <div className="wi-body">
            <div className="wi-done">
              <IconCheck />
              <div>
                <div className="wi-done-title">{stage.tokenNo ? nv.token(stage.tokenNo) : nv.queued}</div>
                <div className="wi-done-sub">
                  {[clientName(stage.client), everythingNamed].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
            <button type="button" className="sheet-item wi-finish" onClick={onClose}>
              {nv.done}
            </button>
          </div>
        )}

        {/* ---------- Stage 3p: paid (Jira GRW-290) ---------- */}
        {stage.step === 'paid' && (
          <div className="wi-body">
            <div className="wi-done">
              <IconCheck />
              <div>
                <div className="wi-done-title">
                  {nv.paid(
                    formatMoney(String(stage.totalMinor)),
                    (PAYMENT_MODES.some((m) => m.value === stage.mode) ? tcr(`pay.${stage.mode}`) : stage.mode),
                  )}
                </div>
                <div className="wi-done-sub">
                  {[
                    // Jira GRW-403 — the token this payment closed, or the one it was given.
                    stage.result.tokenNo ? nv.token(stage.result.tokenNo) : null,
                    clientName(stage.client),
                    everythingNamed,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
            <button type="button" className="sheet-item wi-finish" onClick={onClose}>
              {nv.done}
            </button>
          </div>
        )}

        {/* ---------- Stage 3: recorded ---------- */}
        {stage.step === 'done' && (
          <div className="wi-body">
            <div className="wi-done">
              <IconCheck />
              <div>
                <div className="wi-done-title">{later ? nv.booked : nv.recorded}</div>
                <div className="wi-done-sub">
                  {/* Jira GRW-403 — a walk-in gets the branch's next token; an advance booking gets one on arrival. */}
                  {stage.result.tokenNo ? `${nv.token(stage.result.tokenNo)} · ` : ''}
                  {/*
                    Jira GRW-451 — WHEN, for a booking that is not now.
                    "Booked · Haircut · Nisha" is the one confirmation whose most important fact was missing:
                    the day and time are what the receptionist reads back to the client, and they had to be
                    taken on trust from the slot that was tapped two screens ago. A walk-in says nothing here,
                    because "now" is the whole of its answer.
                  */}
                  {later
                    ? `${formatDateWithWeekday(stage.result.startAt, timezone, { withYear: false, locale })} · ${formatTime(stage.result.startAt, timezone)} · `
                    : ''}
                  {everythingNamed} ·{' '}
                  {providers?.find((p) => p.id === stage.result.schedulableId)?.displayName ?? providerNoun}
                </div>
              </div>
            </div>

            {/*
              The overlap, said out loud.
              12-conventions.md records this as a Known gap: checkout has
              tolerated overlapping records since GRW-007 and has never told
              anybody. A calendar quietly showing two people in one chair is
              worse than a sentence explaining why.
            */}
            {stage.result.overlapping && (
              <div className="wi-overlap">
                {nv.overlap(
                  providers?.find((p) => p.id === stage.result.schedulableId)?.displayName ?? providerNoun,
                )}
              </div>
            )}

            {/*
              No till for a future booking. Nobody has had the service and
              nobody is paying today; the money is taken from Bookings on the
              day, through the same checkout. Offering it here would invite a
              payment recorded against a visit that has not happened.
            */}
            {!later && (
              <>
                {tillClosedUnpaid && <div className="wi-overlap" role="status">{nv.notPaidYet}</div>}
                {checkoutError && <div role="alert" className="wi-error">{checkoutError}</div>}
                <button
                  type="button"
                  className="sheet-item wi-take-payment"
                  disabled={loadingCheckout}
                  onClick={() => void openCheckout(stage.result)}
                >
                  {loadingCheckout ? nv.openingTill : nv.takePayment}
                </button>
              </>
            )}
            <button type="button" className="sheet-item wi-finish" onClick={onClose}>
              {nv.done}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
