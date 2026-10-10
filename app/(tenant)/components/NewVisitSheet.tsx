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
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  BookingConflictError,
  formatMoney,
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
import { asMinor, matchItems, MIN_CHARS } from '../lib/service-match';
import { extraSuggestions } from '../lib/service-suggest';
import { useServiceSuggestions } from '../lib/useServiceSuggestions';
import { useLabel } from './LabelsProvider';
import { LargeAmountDeclined, useLargeAmountGuard } from './LargeAmountConfirm';
import { useBranch } from './BranchProvider';
import { useSession } from './SessionProvider';
import { canSee, type MemberRole } from '../lib/nav-policy';
import { PhoneField } from './PhoneField';
import { FormModeSwitch } from '../appointments/new/FormModeSwitch';
import { BookAgainCard, type BookAgainPlan } from './BookAgainCard';
import type { FreeTime } from '../lib/book-again';
import { fromStoredPhone, toStoredPhone } from '../lib/phone';
import { usePhoneProblem } from '../lib/use-phone-problem';
import { CheckoutSheet, PAYMENT_MODES } from './CheckoutSheet';
import { Pagination } from './Pagination';
import { PackageDetails } from './PackageDetails';
import { fixVisitHref, payVisitHref } from '../lib/pay-token';
import { ServiceSheet } from './ServiceSheet';
import { autoFocusField, useAutoFocusField } from '../../shared/a11y/soft-keyboard';
import { ReceiptShare } from './ReceiptShare';
import { PaymentDone } from './PaymentDone';
import { confirmRows, receiptRows, type ReceiptRow } from '../lib/receipt-text';
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconMapPin,
  IconScissors,
  IconMinus,
  IconPayCard,
  IconPayCash,
  IconPayOther,
  IconPayUpi,
  IconPlus,
  IconSearch,
  IconUser,
} from './icons';
import { servicePhotoUrl } from '../lib/service-photos';
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

/** Only digits and the marks a number is written with, and at least one digit: what a phone number looks like as it is typed. */
export function isNumberLike(value: string): boolean {
  return /^[+\d\s()-]+$/.test(value) && /\d/.test(value);
}

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
/** The icon above each way of paying — the design's four tiles. Keyed by the mode the API stores. */
const PAY_ICONS: Record<string, ReactNode> = {
  cash: <IconPayCash />,
  card: <IconPayCard />,
  upi: <IconPayUpi />,
  other: <IconPayOther />,
};

/**
 * Record payment's menu, rows per page. Three rows are 184px and the pager under them 54px. Measured at 375×667,
 * the shortest phone this ships to, the form above the list ends at 382px and the tray starts at 516px, so two
 * rows show above the tray and the pager is a ~100px scroll away; from about 780px tall the whole page is on
 * screen. What matters is that it is bounded: three rows and a pager, never a list as long as the menu.
 */
const SERVICES_PER_PAGE = 3;
/** The most lines one sale may carry — `POST /api/v1/counter-sales` takes 1–12, so + stops there. */
const BILL_MAX_LINES = 12;
/** Up to this many people, Record payment shows them as a row of names; more, and it keeps the dropdown. */
const STYLIST_CHIPS_MAX = 6;
/** The chip that lists the Packages tab's packages rather than one kind of service. Not a category name anyone can type. */
const PACKAGES_CHIP = '\u0000packages';

/**
 * A bill line's name, numbered when the same service is on the bill more than once — "Haircut (2/3)" — so three
 * lines that each take an amount can be told apart (a child's cut may cost less than the parent's).
 */
function numberedName(list: { serviceId: string; name: string }[], i: number): string {
  const item = list[i]!;
  const same = list.filter((x) => x.serviceId === item.serviceId).length;
  if (same < 2) return item.name;
  const nth = list.slice(0, i + 1).filter((x) => x.serviceId === item.serviceId).length;
  return `${item.name} (${nth}/${same})`;
}

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
  /**
   * `confirm` is the message for this client, built HERE rather than at render (owner, 2026-10-07), for the
   * same reason the bill is: the page refreshes after a save and the state the message is made of moves.
   * Null for a visit starting now — there is nothing to tell somebody already in the chair.
   */
  | { step: 'done'; client: PickedClient; result: WalkInDone; confirm: ReceiptRow[] | null }
  /** Jira GRW-222 — waiting in the queue; no stylist and no visit yet. */
  | { step: 'queued'; client: PickedClient; tokenNo: number | null; confirm: ReceiptRow[] | null }
  | { step: 'error'; client: PickedClient; message: string }
  /** Jira GRW-290 — Record payment settled in one go. */
  | {
      step: 'paid';
      client: PickedClient;
      result: WalkInDone;
      totalMinor: number;
      mode: PaymentMode;
      /** The WhatsApp bill, built once as the payment landed: the page refreshes after it, and the token goes with it. */
      bill: ReceiptRow[];
    };

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
  onAnother,
  timezone,
  mode: initialMode = 'now',
  purpose = 'visit',
  presentation = 'sheet',
  token,
  tokenGone = false,
}: {
  onClose: () => void;
  /** Next customer on the payment done screen: a fresh form. Without it, Next customer closes like Done. */
  onAnother?: () => void;
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
   * Paying a token whose link no longer finds it waiting (paid on another phone, or left): the form opens as a plain
   * Record payment with a warning above it, so the money is not taken twice without anyone noticing.
   */
  tokenGone?: boolean;
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
  /** The New Booking page (not Record payment): every question on one screen, instead of find-them then what-are-they-having. */
  const pageForm = presentation === 'page' && !token;
  /** Record payment on its own routed page — the one-screen till the mock draws, not the New booking form. */
  const payPage = forPayment && presentation === 'page';
  /*
   * New booking's own page, and ONLY it (owner, 2026-10-10).
   *
   * `pageForm` is true on Record payment too, so every gate below has to say `!forPayment` as well or the till
   * loses the menu it was deliberately given. The two screens do different jobs: the till rings up what has
   * already happened and wants its catalogue in front of it; New booking records a decision that has not been
   * made yet, and a catalogue there is 52 services asked of someone who already knows which one they want.
   *
   * What this flag turns off: the browsable menu (kinds, photos, pager), the stylist row, and the Booking date
   * and time pair. Each becomes ONE line saying its answer, which opens the full control. Three questions, each
   * asked once, instead of eleven controls two of which could contradict each other.
   */
  const bookForm = pageForm && !forPayment;
  /** Which question is open over the form. `null` is the form itself. */
  const [asking, setAsking] = useState<'services' | null>(null);
  /**
   * Both routed pages — New booking and Record payment — pick services the same way (owner, 2026-10-07).
   *
   * They had drifted into two pickers over the same catalogue: a photo menu you could browse by kind, paged,
   * tapped on and off; and a text list that appeared only once you had typed a name you were expected to
   * already know. One owner called it out as "a bit different", and it is the same job on both screens — the
   * receptionist taking the booking is the one who rings it up an hour later.
   *
   * A sheet keeps the compact list: it opens over something else, with no room for a menu.
   */
  const onPage = presentation === 'page';
  /**
   * What happens to this visit now: it waits, or it starts (owner, 2026-10-07).
   *
   * A page asks it as chips, in the slot where Record payment asks how they paid, with ONE filled button under
   * them. Two competing buttons was the old shape, and it needed GRW-458's swap — "Start now" moved below the
   * queue when no chair was free, because leading with it offered something the branch could not do, and
   * GRW-456 had to disable it outright at a branch with nobody on. A chip row has no such problem: with no
   * chair free "Waiting" is simply the one already chosen, and "Start now" is still there to be tapped.
   *
   * `null` means nobody has chosen, so the branch's own state answers. A sheet keeps the two buttons: its tray
   * has no room for a row of chips above one.
   */
  const [outcomeWanted, setOutcomeWanted] = useState<'queue' | 'start' | null>(null);
  const checkPhone = usePhoneProblem();
  const tcr = useTranslations('chrome');
  const tw = useTranslations('staffWizard');
  const router = useRouter();
  const clientNoun = useLabel('customer', 'Client');
  const providerNoun = useLabel('provider', 'Staff member');
  const servicesNoun = useLabel('services', 'Services');

  const [stage, setStage] = useState<Stage>(() => (token && forPayment ? { step: 'details', client: clientOfToken(token) } : { step: 'client' }));
  /** On the single page the form stays on screen while it saves and when a save fails. */
  const onForm = stage.step === 'client' || stage.step === 'saving' || stage.step === 'error';
  /** The single page: who was picked from the search, if anyone (otherwise the name and phone typed in). */
  const [selected, setSelected] = useState<PickedClient | null>(null);
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
  // On the New booking and Record payment PAGES this box is part of the server's HTML, so the keyboard question is
  // asked after hydration through this ref rather than through `autoFocus`, which the two sides would disagree on.
  const searchRef = useAutoFocusField<HTMLInputElement>();
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
  // Record payment: Mark done was pressed with no service on the bill.
  const [servicesError, setServicesError] = useState(false);
  /*
   * A returning client picked with no number on file, who gives one now: the number the desk types for them. It is
   * saved to the client with the visit (Mark done, Start, Book it), and cleared whenever a different client is picked.
   */
  const [addingPhone, setAddingPhone] = useState(false);
  const [pickedPhone, setPickedPhone] = useState('');
  const [pickedPhoneError, setPickedPhoneError] = useState<string | null>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const selectedId = selected?.kind === 'existing' ? selected.id : null;
  useEffect(() => {
    setAddingPhone(false);
    setPickedPhone('');
    setPickedPhoneError(null);
  }, [selectedId]);
  // Record payment: a package was picked that would take the bill past its line limit. Cleared by any change to the bill.
  const [billFull, setBillFull] = useState(false);
  // Record payment: which kind of service the list shows ('' is all of them).
  const [serviceCategory, setServiceCategory] = useState('');
  const [servicePage, setServicePage] = useState(1);
  /** The package whose "View details" is open, if any. */
  const [pkgDetailsId, setPkgDetailsId] = useState<string | null>(null);
  /*
   * Record payment keeps the Name and Phone number fields closed until they are asked for.
   *
   * The search box above already seeds the name from whatever is typed into it (see its `onChange`), so for the
   * usual counter sale the two fields are a copy of what the desk has just written — 148px of a phone, under a
   * search box that did the job. They are still one tap away, for a number, or to correct the name.
   */
  const [addingNew, setAddingNew] = useState(false);
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
  // Record payment is the same everywhere (owner, 2026-10-09): the work is done, so nobody is the answer until a name
  // is tapped, and "Whoever is free" and "No stylist" are no longer chips to pick between.
  const [noStylist, setNoStylist] = useState(forPayment);
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
    const client: PickedClient = closed
      ? { kind: 'new', name: c.name?.trim() || nv.noName, phone: c.waPhone ?? '' }
      : { kind: 'existing', id: c.id, name: c.name, phone: c.waPhone, locationId: c.locationId };
    if (pageForm) {
      // The single page: the person is shown in place of the name and phone fields, and the rest stays on screen.
      setSelected(client);
      setTerm('');
      setComboOpen(false);
      return;
    }
    setStage({ step: 'details', client });
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
    setSelected(null);
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
    /*
     * The client least of all (Jira GRW-453): a client record belongs to ONE branch, and
     * `appointment_client_same_branch_fk` refuses a visit that pairs them with another. The branch dropdown
     * clears `selected` itself, but on a full reload the shared branch arrives late and moves the branch with
     * nobody having touched it — that path left the old branch's client attached to the new branch's visit,
     * and the refusal only surfaced at the save.
     */
    setSelected(null);
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
      services.map((s) => ({ item: s, text: [s.name], priceMinor: asMinor(s.priceMinor) })),
      q,
      20,
    );
  }, [services, serviceTerm]);

  /**
   * Record payment lists the whole menu, because a counter rings up what was done and cannot be expected to
   * know a name to type: the first six alphabetically are what New booking offers before anyone has typed, and
   * on this screen that left 46 of 52 services reachable only by guessing at the search box. A kind narrows it.
   */
  const categories = useMemo(
    () => (onPage && services ? [...new Set(services.map((s) => s.categoryName).filter((c): c is string => Boolean(c)))] : []),
    [onPage, services],
  );
  /** Record payment's Packages chip: the Packages tab's bundles, listed in the menu's place. */
  const packageMode = onPage && serviceCategory === PACKAGES_CHIP;
  const shownServices = useMemo(() => {
    if (!onPage) return filteredServices;
    if (serviceCategory === PACKAGES_CHIP) return [];
    const typed = serviceTerm.trim().length >= MIN_CHARS;
    const pool = typed ? filteredServices : (services ?? []);
    return serviceCategory ? pool.filter((s) => s.categoryName === serviceCategory) : pool;
  }, [onPage, filteredServices, services, serviceTerm, serviceCategory]);


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
      combos.map((o) => ({
        item: o,
        text: [o.title, ...o.serviceIds.map((id) => serviceById.get(id)?.name ?? '')],
        priceMinor: asMinor(o.comboPriceMinor),
      })),
      q,
    );
  }, [combos, serviceTerm, serviceById]);

  /*
   * Record payment shows its menu a few rows at a time, never as one long scroll. Eighteen Hair services, or all
   * fifty-two, are a long way to drag a thumb, a long way to tab through, and fifty-two buttons for a screen reader
   * to read out. A page is three rows: it sits on the screen with the tray on a phone's height, and the shared
   * Pagination under it says where you are. Narrowing (a kind, or typing) starts again at page one.
   */
  const shownPackages = packageMode ? (serviceTerm.trim().length >= MIN_CHARS ? matchingCombos : combos) : [];
  const shownCount = packageMode ? shownPackages.length : shownServices.length;
  const serviceLastPage = Math.max(1, Math.ceil(shownCount / SERVICES_PER_PAGE));
  const serviceAt = Math.min(servicePage, serviceLastPage);
  const pagedServices = onPage
    ? shownServices.slice((serviceAt - 1) * SERVICES_PER_PAGE, serviceAt * SERVICES_PER_PAGE)
    : shownServices;
  const pagedPackages = shownPackages.slice((serviceAt - 1) * SERVICES_PER_PAGE, serviceAt * SERVICES_PER_PAGE);
  useEffect(() => setServicePage(1), [serviceCategory, serviceTerm]);

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
    /*
     * Record payment: a package joins the bill, it does not replace it (owner, 2026-10-07 — a facial rung up, then
     * a package picked, left only the package). Whatever single services were already on the bill move beside it,
     * as extras, with the amounts already typed for them. Only a previous package's own services go, since one
     * package is on the bill at a time. New booking keeps replacing: it cannot settle extras beside a package.
     */
    const singles = comboActive ? extras : picked;
    // `POST /counter-sales` takes at most BILL_MAX_LINES lines: say so now, not as a refusal at Mark done.
    if (forPayment && singles.length + items.length > BILL_MAX_LINES) {
      setBillFull(true);
      return;
    }
    setPicked(forPayment ? items.map((item, i) => ({ ...item, paidRupees: shares[i] })) : items);
    setOfferId(offer.id);
    setComboPriceMinor(offer.comboPriceMinor);
    setComboTitle(offer.title);
    setComboAmountText(offer.comboPriceMinor ? String(Number(offer.comboPriceMinor) / 100) : '');
    setExtras(forPayment ? singles : []);
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
    if (!pageForm) setStage({ step: 'when', client });
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

  /*
   * Record payment: one service more than once — a parent and two children all having a haircut. Each one is its
   * own line on the bill, which is what the API already takes (one leg per line) and what makes reports count three
   * haircuts, not one.
   */
  const countOnBill = (serviceId: string) =>
    // With a package on the bill, `picked` is the package's own services: a Haircut inside it is not a Haircut
    // the row's counter added, and − on it must not take the package apart.
    (comboActive ? 0 : picked.filter((x) => x.serviceId === serviceId).length) +
    extras.filter((x) => x.serviceId === serviceId).length;

  /** One more of a service. Unlike `addService`, the search it was found by stays, so + can be tapped again. */
  const addOneMore = (s: Service) => {
    const item = toItem(s);
    if (comboActive) setExtras((prev) => [...prev, item]);
    else setPicked((prev) => [...prev, item]);
  };

  /** One fewer: the line added last goes first, so an amount typed on an earlier line is kept. */
  const removeOneOf = (serviceId: string) => {
    const e = extras.map((x) => x.serviceId).lastIndexOf(serviceId);
    if (e >= 0) return removeExtraAt(e);
    if (comboActive) return;
    const p = picked.map((x) => x.serviceId).lastIndexOf(serviceId);
    if (p >= 0) removeAt(p);
  };

  /** Off the bill altogether: the row's own tap, as it always was. */
  const removeAllOf = (serviceId: string) => {
    setExtras((prev) => prev.filter((x) => x.serviceId !== serviceId));
    if (!comboActive && picked.some((x) => x.serviceId === serviceId)) {
      setPicked((prev) => prev.filter((x) => x.serviceId !== serviceId));
      setOfferId(null);
      setComboPriceMinor(null);
      setComboTitle(null);
      setComboAmountText('');
    }
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
  // Shown only while it is still true: the first service put on the bill answers it.
  const showServicesError = servicesError && picked.length === 0;
  useEffect(() => setBillFull(false), [picked.length, extras.length]);
  const paidTotalMinor =
    picked.reduce((sum, item) => sum + (rupeesToMinor(item.paidRupees) ?? 0), 0) +
    extras.reduce((sum, item) => sum + (rupeesToMinor(item.paidRupees) ?? 0), 0);
  // Jira GRW-292 — the combo's own price (typed, in Record payment) plus whatever sits beside it.
  const comboWithExtrasTotalMinor = forPayment
    ? (rupeesToMinor(comboAmountText) ?? 0) + extras.reduce((sum, item) => sum + (rupeesToMinor(item.paidRupees) ?? 0), 0)
    : Number(comboPriceMinor ?? 0) + extras.reduce((sum, item) => sum + Number(item.priceMinor ?? 0), 0);
  /** Record payment: the money being taken, as the bill below adds it up — what the tray shows beside Mark done. */
  const billTotalMinor = comboActive ? comboWithExtrasTotalMinor : paidTotalMinor;
  /*
   * Record payment: what is being charged sits beside Mark done. The bill's lines are under the menu, and with the
   * tray pinned over the bottom of the page they were a scroll below it — the person was asked to take money for an
   * amount the screen was not showing. Tapping the total takes them to the lines, where each amount can be changed.
   */
  const billCount = picked.length + extras.length;
  const trayTotal =
    payPage && billCount > 0 ? (
      <button
        type="button"
        className="wi-tray-total"
        aria-label={nv.trayTotalA11y(billCount, formatMoney(String(billTotalMinor)))}
        onClick={() => {
          const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          document.getElementById('wi-bill')?.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
        }}
      >
        <span className="wi-tray-total-label">{nv.trayTotal(billCount)}</span>
        <span className="wi-tray-total-amount">{formatMoney(String(billTotalMinor))}</span>
      </button>
    ) : null;
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
  /**
   * The time as this screen writes it: "11:30 AM".
   *
   * `formatTime`'s en-IN gives "11:30 am", and on the confirmation screen that sat two lines above the message's
   * own "11:30 AM" — the same minute, spelt two ways, in one glance. One formatter for all of them.
   */
  const clockTime = (at: Date | string) =>
    new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(
      typeof at === 'string' ? new Date(at) : at,
    );
  const nowLabel = useMemo(
    () => clockTime(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `nowHm` is the minute the label is for
    [locale, timezone, nowHm],
  );
  /*
   * The till's clock, made true.
   *
   * `nowLabel` is only ever as fresh as the last render, and the comment above it has long claimed it "changes
   * once a minute" — nothing made it. On a form nobody is typing in there is no render, so the header kept the
   * minute the screen was opened: a desk that opens Record payment, serves the client and takes the money ten
   * minutes later was told the wrong time on the one screen whose job is recording when money changed hands.
   * Half a minute keeps it within a minute of right; it runs only where the clock is shown.
   */
  const [, setMinute] = useState(0);
  useEffect(() => {
    if (!forPayment) return;
    const id = window.setInterval(() => setMinute((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [forPayment]);

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
    if (!later || !(pageForm ? onForm : stage.step === 'when') || picked.length === 0) return;
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
  }, [later, stage.step, onForm, pageForm, day, picked, extras, schedulableId, listBranch, timezone]);

  /**
   * The Booking time, against what is actually free.
   *
   * `askedMatch` is the slot the grid should land on for the time asked for: that time if it is free, else
   * the first free one after it, else nothing. The fetch effect above seeds a slot ONCE per load from
   * `timeWantedRef`; this is what makes CHANGING the select move the grid, which it did not do when the
   * control was last on this screen — the reason it was taken off.
   *
   * Up here with the other hooks, NOT beside the markup that reads it: `if (checkoutRows…) return` above
   * renders the till instead of the form, so a hook below it runs on some renders and not others. React
   * counts hooks, and "Take payment now" took the whole screen down with "Rendered fewer hooks than
   * expected" the first time the till opened.
   */
  const slotList = useMemo(() => (slots ? slots.sections.flatMap((sec) => sec.slots) : []), [slots]);
  const askedMatch = useMemo(() => {
    if (!timeWanted || slotList.length === 0) return null;
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const at = (utc: string) => hm.format(new Date(utc));
    const exact = slotList.find((sl) => at(sl.utc) === timeWanted);
    return { exact: Boolean(exact), slot: exact ?? slotList.find((sl) => at(sl.utc) > timeWanted) ?? null };
  }, [timeWanted, slotList, timezone]);

  // Asking for a time moves the grid to it. Keyed on the ASK, so a slot tapped by hand afterwards is left alone.
  useEffect(() => {
    if (!timeWanted || !askedMatch) return;
    setSlotUtc(askedMatch.slot?.utc ?? null);
  }, [timeWanted, askedMatch]);

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
  /** Hoisted out of the tray: the chips above the button and the button itself have to agree about this. */
  const queueOffered = !later && !reclaim && !forPayment;
  /** The same question with the time taken out of it: may this visit wait at all, whatever it is set to now? */
  const canQueue = onPage && !reclaim && !forPayment;
  /** A page decides the outcome with chips; the sheet still decides it by which of two buttons is pressed. */
  const pageOutcome = onPage && queueOffered;
  const outcome = outcomeWanted ?? (noChairFree ? 'queue' : 'start');
  const queueing = pageOutcome && outcome === 'queue';

  useEffect(() => {
    if (later || !(pageForm ? onForm : stage.step === 'details')) return;
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
  }, [later, stage.step, onForm, pageForm]);

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
    setStage(withBill({
      step: 'paid',
      client,
      result: visit,
      totalMinor: amounts.reduce((a, b) => a + b, 0) + extraServices.reduce((sum, e) => sum + e.paidAmountMinor, 0),
      mode: paymentMode,
    }));
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
      setStage({ step: 'queued', client, tokenNo: entry.tokenNo, confirm: confirmFor({ startAt: null, tokenNo: entry.tokenNo, schedulableId: null }) });
    } catch (error) {
      setStage({ step: 'error', client, message: error instanceof ApiError ? error.message : nv.saveUnknown });
    }
  };

  /** The single page's person: the one picked from the search, or the typed name and phone — null (fields flagged) while neither is usable. */
  const pageClient = (): PickedClient | null => {
    if (selected) return selected;
    if (!newName.trim()) {
      setNameError(true);
      return null;
    }
    const phoneProblem = checkPhone(newPhone, { required: later });
    if (phoneProblem) {
      setPhoneError(phoneProblem);
      return null;
    }
    return { kind: 'new', name: newName.trim(), phone: toStoredPhone(newPhone) ?? '' };
  };

  /**
   * Record payment: Mark done stays pressable, so that pressing it with something missing can say what.
   * Flags every missing field, takes the eye to the first one from the top of the page, and returns the
   * client only when there is nothing left to fill in.
   */
  /** Takes the eye to a field that needs fixing, on the next render (it may only mount on that render). */
  const bringIntoView = (find: () => HTMLElement | null) => {
    const run = () => {
      const target = find();
      if (!target) return;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      // Not the service search: focusing it would raise the keyboard over the menu the person has to look at.
      if (target.id !== 'wi-services') target.focus({ preventScroll: true });
    };
    window.setTimeout(run, 0);
  };

  /*
   * A returning client with no number gives one at the counter. It is saved to their record BEFORE the visit, so a
   * number the salon cannot take — half-typed, or already another client's — stops the visit with the field saying
   * why, rather than the visit going through and the number being lost after it. The server names the other client
   * (409 `phone_in_use`), and its sentence is shown as it is, as the client profile does.
   */
  const withPickedPhone = async (client: PickedClient): Promise<PickedClient | null> => {
    if (client.kind !== 'existing' || client.phone || !pickedPhone.trim()) return client;
    const problem = checkPhone(pickedPhone, { required: false });
    if (problem) {
      setPickedPhoneError(problem);
      bringIntoView(() => document.getElementById('wi-picked-phone'));
      return null;
    }
    setPhoneSaving(true);
    try {
      const updated = await api.updateCustomer(client.id, { phone: toStoredPhone(pickedPhone) ?? null });
      const next: PickedClient = { ...client, phone: updated.waPhone };
      setSelected(next);
      return next;
    } catch (err) {
      setPickedPhoneError(err instanceof ApiError ? err.message : nv.saveUnknown);
      bringIntoView(() => document.getElementById('wi-picked-phone'));
      return null;
    } finally {
      setPhoneSaving(false);
    }
  };

  /** The page's one way forward: who it is (and their new number, if any), then the visit. */
  const thenVisit = async (client: PickedClient | null, visit: (c: PickedClient) => Promise<void>) => {
    if (!client) return;
    const ready = await withPickedPhone(client);
    if (ready) await visit(ready);
  };

  // `known`: paying a token, whose client is the token's and has no fields to check.
  const checkBeforeMarkDone = (known?: PickedClient): PickedClient | null => {
    const client = known ?? pageClient();
    const noServices = picked.length === 0;
    if (noServices) setServicesError(true);
    const firstBadAmount = !noServices && !amountsValid;
    if (client && !noServices && !firstBadAmount) return client;
    // The fields behind "Add name and number" mount on the next render, so look for the target after it.
    bringIntoView(() =>
      !client
        ? document.getElementById(newName.trim() ? 'wi-phone' : 'wi-name')
        : noServices
          ? document.getElementById('wi-services')
          : document.querySelector<HTMLElement>('.wi-amount input[aria-invalid="true"]'),
    );
    return null;
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
          confirm: confirmFor({ startAt: booked.startAt, tokenNo: null, schedulableId: booked.schedulableId }),
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
        setStage(withBill({
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
        }));
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
        setStage(withBill({
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
        }));
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
      // A walk-in that has just started gets no message: `confirmFor` answers null for it.
      setStage({
        step: 'done',
        client,
        result: recorded,
        confirm: confirmFor({ startAt: later ? recorded.startAt : null, tokenNo: recorded.tokenNo ?? null, schedulableId: recorded.schedulableId }),
      });
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
        setStage(pageForm ? { step: 'client' } : { step: 'when', client });
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

  /*
   * Owner, 2026-10-07 — the WhatsApp bill, from what Mark done recorded: singles at what was charged, a package at
   * its amount with what its services cost separately, the branch named only where there is more than one.
   *
   * Built ONCE, as the payment lands, from the state Mark done was pressed with, and kept on the stage. Every payment
   * path calls `router.refresh()`, and on a token's page that re-runs the route: the token is no longer waiting, so it
   * comes back undefined and with it the token's branch — a bill rebuilt on each render could change branch, or lose
   * its stylist when the branch's people reload, after the client has already seen it.
   */
  const withBill = (paid: Omit<Extract<Stage, { step: 'paid' }>, 'bill'>): Stage => ({ ...paid, bill: billFor(paid) });
  const billFor = (paid: Omit<Extract<Stage, { step: 'paid' }>, 'bill'>): ReceiptRow[] => {
    const all = session?.branches ?? [];
    const branchName = all.length > 1 ? (all.find((b) => b.id === (paysToken?.locationId ?? listBranch))?.name ?? null) : null;
    // The day, then the time as this screen's own clock writes it ("1:37 PM"; `formatTime`'s en-IN gives "1:37 pm").
    const day = new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(paid.result.startAt));
    const time = clockTime(paid.result.startAt);
    const when = `${day}, ${time}`;
    const lineOf = (item: PickedItem) => ({ name: item.name, amountMinor: rupeesToMinor(item.paidRupees) ?? 0 });
    const stylist = paid.result.schedulableId ? (providers?.find((p) => p.id === paid.result.schedulableId)?.displayName ?? null) : null;
    return receiptRows(
      {
        businessName: session?.businessName ?? null,
        branchName,
        when,
        tokenNo: paid.result.tokenNo ?? null,
        stylist,
        singles: (comboActive ? extras : picked).map(lineOf),
        pkg: comboActive
          ? {
              title: comboTitle ?? nv.combo,
              services: picked.map((x) => x.name),
              paidMinor: rupeesToMinor(comboAmountText) ?? 0,
              separateMinor: comboListMinor,
            }
          : null,
        totalMinor: paid.totalMinor,
        paidBy: PAYMENT_MODES.some((m) => m.value === paid.mode) ? tcr(`pay.${paid.mode}`) : paid.mode,
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
      (minor) => formatMoney(String(minor)),
    );
  };

  /**
   * The confirmation to hand the client: what was booked, or what they are waiting for.
   *
   * Only where there is something worth sending — a day and time they will have to remember, or a token
   * number they are holding. A walk-in starting now gets nothing: they are standing at the counter.
   *
   * No services and no total on it (owner, 2026-10-07): a visit grows, and a message quoting ₹300 against a
   * bill of ₹800 is an argument at the counter that the message started. Money goes on the receipt, which is
   * written once the work is done.
   */
  const confirmFor = (opts: { startAt: string | null; tokenNo: number | null; schedulableId: string | null }): ReceiptRow[] | null => {
    if (!opts.startAt && opts.tokenNo === null) return null;
    const all = session?.branches ?? [];
    const branchName = all.length > 1 ? (all.find((b) => b.id === listBranch)?.name ?? null) : null;
    const when = opts.startAt
      ? `${formatDateWithWeekday(opts.startAt, timezone, { withYear: false, locale })} · ${clockTime(opts.startAt)}`
      : null;
    const stylist = opts.schedulableId ? (providers?.find((p) => p.id === opts.schedulableId)?.displayName ?? null) : null;
    return confirmRows(
      { businessName: session?.businessName ?? null, branchName, when, tokenNo: opts.tokenNo, stylist },
      {
        title: opts.startAt ? nv.confirmBooked : nv.confirmQueued,
        token: nv.token,
        stylist: (name: string) => nv.receiptStylist(providerNoun, name),
        seeYou: opts.startAt ? nv.confirmSeeThen : nv.confirmSeeSoon,
      },
    );
  };

  const busy = stage.step === 'saving' || phoneSaving;
  /** Jira GRW-290 — once a Record payment visit exists, its lines are what was written. */
  const linesLocked = forPayment && savedVisit !== null;
  const headSub =
    stage.step === 'client' || (pageForm && (stage.step === 'saving' || stage.step === 'error'))
      ? nv.whoIsThis(clientNoun.toLowerCase())
      : paysToken?.tokenNo
        ? `${nv.token(paysToken.tokenNo)} · ${clientName(stage.client)}`
        : clientName(stage.client);

  const serviceSearch = (
    <>
            {/* Same on the till: "Search 52 services or combos…" in the box says it, and the grid below shows it. */}
            {onPage ? null : (
              <h2 className="wi-section-label">
                {picked.length > 0 ? nv.addMore : nv.whichService}
              </h2>
            )}
            <div id="wi-services" className="picker-search">
              <input
                type="search"
                className={`wi-search-input wi-search-input-plain ${showServicesError ? 'field-invalid' : ''}`}
                placeholder={services === null ? nv.loadingServices : nv.searchServices(services.length) + (onPage && picked.length === 0 && extras.length === 0 ? ' *' : '')}
                aria-required={onPage ? true : undefined}
                aria-invalid={showServicesError || undefined}
                aria-label={picked.length > 0 ? nv.addMore : nv.whichService}
                value={serviceTerm}
                onChange={(e) => setServiceTerm(e.target.value)}
                disabled={busy || linesLocked}
              />
            </div>
            {showServicesError ? (
              <div role="alert" className="field-error">
                {nv.servicesMissing}
              </div>
            ) : null}
            {billFull ? (
              <div role="alert" className="field-error">
                {nv.billFull(BILL_MAX_LINES)}
              </div>
            ) : null}
            {/* Kinds of service, one tap each: Hair, Skin, Nails. Only when there is something to choose between. */}
            {onPage && categories.length + (combos.length > 0 ? 1 : 0) > 1 ? (
              <div className="wi-chips wi-category-chips" role="group" aria-label={nv.serviceKinds}>
                {['', ...categories, ...(combos.length > 0 ? [PACKAGES_CHIP] : [])].map((c) => (
                  <button
                    key={c || 'all'}
                    type="button"
                    className={`wi-chip ${serviceCategory === c ? 'wi-chip-on' : ''}`}
                    aria-pressed={serviceCategory === c}
                    onClick={() => setServiceCategory(c)}
                  >
                    {c === PACKAGES_CHIP ? nv.packagesChip : c || nv.allServices}
                  </button>
                ))}
              </div>
            ) : null}
            {/*
              `wi-service-idle` folds the untyped list away on a phone (72-walk-in-sheet.css) — but ONLY when
              there are rows to fold. This box also holds what the screen says when there is nothing to list:
              "loading", and GRW-384 AC-03's "this branch has no services yet" with the owner's add-or-copy
              link. Hiding those leaves an empty search box and a dead button explaining nothing.
            */}
            <div
              className={`picker-results wi-service-results ${onPage ? 'wi-service-list' : ''} ${
                // A page browses: its menu is a few rows at a time, not 52, so it stays on screen. A sheet still
                // folds the untyped list away — it opens over something else and has no room to show one.
                !onPage && services !== null && services.length > 0 && serviceTerm.trim() === '' ? 'wi-service-idle' : ''
              }`}
            >
              {/*
                * The Packages chip: each package from the Packages tab as one row that toggles, like a service. Tapping
                * one puts its services on the bill at the package's one price; tapping it again takes the package off.
                */}
              {pagedPackages.map((o) => {
                const on = offerId === o.id;
                const first = serviceById.get(o.serviceIds[0] ?? '');
                const price = o.comboPriceMinor ? formatMoney(o.comboPriceMinor) : nv.comboServices(o.serviceIds.length);
                /*
                 * Laid out exactly as a service row — photo, name over price, the ring at the end — with "View details"
                 * on the price line. The whole row is one toggle (`wi-card-hit`, stretched over it) and the link sits
                 * above that, so it can be a button of its own: a button cannot hold another button. What the row
                 * shows is hidden from a screen reader, which hears the toggle's own name instead, once.
                 */
                return (
                  <div key={`pkg-${o.id}`} className={`picker-row wi-row wi-card wi-card-pkg ${on ? 'wi-card-on' : ''}`}>
                    <button
                      type="button"
                      className="wi-card-hit"
                      aria-pressed={on}
                      aria-label={`${o.title}, ${price}`}
                      onClick={() => (on ? removeCombo() : applyCombo(o))}
                      disabled={busy || linesLocked}
                    />
                    <span className="wi-card-photo" aria-hidden="true">
                      {first ? <img src={servicePhotoUrl(first)} alt="" width={44} height={44} /> : null}
                    </span>
                    <span className="wi-card-text">
                      <span className="picker-row-name" aria-hidden="true">
                        {o.title}
                      </span>
                      <span className="wi-pkg-line">
                        <span className="picker-row-meta" aria-hidden="true">
                          {price}
                        </span>
                        <span className="wi-pkg-dot" aria-hidden="true">
                          ·
                        </span>
                        <button
                          type="button"
                          className="wi-pkg-details"
                          aria-label={nv.viewDetailsOf(o.title)}
                          aria-haspopup="dialog"
                          onClick={() => setPkgDetailsId(o.id)}
                        >
                          {nv.viewDetails}
                        </button>
                      </span>
                    </span>
                    <span className="wi-card-tick" aria-hidden="true">
                      {on ? <IconCheck /> : null}
                    </span>
                  </div>
                );
              })}
              {(packageMode ? [] : matchingCombos).map((o) => (
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
              {pagedServices.map((s) => {
                /*
                 * A page's menu rows TOGGLE (owner, 2026-10-07): at a counter the same handful of services is rung
                 * up all day, so they are tapped rather than searched, and tapping one already on the list takes it
                 * off again. Once it is on, a counter takes the place of the tick, for the same service more than
                 * once — a parent and two children having a haircut (owner, 2026-10-07).
                 * New booking draws the same row: the search no longer clears when one is tapped, which is what lets
                 * a second and a third be added without typing the name again.
                 * A sheet keeps the plain row — one tap, straight onto the list, because it has no room for a menu.
                 */
                if (onPage) {
                  const count = countOnBill(s.id);
                  const full = picked.length + extras.length >= BILL_MAX_LINES;
                  return (
                    <div key={s.id} className={`picker-row wi-row wi-card ${count > 0 ? 'wi-card-on' : ''}`}>
                      <button
                        type="button"
                        className="wi-card-main"
                        aria-pressed={count > 0}
                        onClick={() => (count > 0 ? removeAllOf(s.id) : addOneMore(s))}
                        disabled={busy || linesLocked || (count === 0 && full)}
                      >
                        <span className="wi-card-photo">
                          <img src={servicePhotoUrl(s)} alt="" width={44} height={44} />
                        </span>
                        <span className="wi-card-text">
                          <span className="picker-row-name">{s.name}</span>
                          <span className="picker-row-meta">{formatMoney(s.priceMinor)}</span>
                        </span>
                        {/* An empty ring until it is on the bill; then the counter beside it says how many. */}
                        {count === 0 ? <span className="wi-card-tick" aria-hidden="true" /> : null}
                      </button>
                      {count > 0 ? (
                        <span className="wi-qty" role="group" aria-label={nv.qtyOnBill(s.name, count)}>
                          <button
                            type="button"
                            className="wi-qty-btn"
                            aria-label={nv.oneLess(s.name)}
                            onClick={() => removeOneOf(s.id)}
                            disabled={busy || linesLocked}
                          >
                            <IconMinus />
                          </button>
                          <span className="wi-qty-n" aria-live="polite">
                            {count}
                          </span>
                          <button
                            type="button"
                            className="wi-qty-btn"
                            aria-label={nv.oneMore(s.name)}
                            onClick={() => addOneMore(s)}
                            disabled={busy || linesLocked || full}
                          >
                            <IconPlus />
                          </button>
                        </span>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="picker-row wi-row"
                    onClick={() => addService(s)}
                    disabled={busy || linesLocked}
                  >
                    <span className="picker-row-name">{s.name}</span>
                    <span className="picker-row-meta">{`${tmin('minutes', { count: s.durationMin })} · ${formatMoney(s.priceMinor)}`}</span>
                  </button>
                );
              })}
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
                shownServices.length === 0 &&
                pagedPackages.length === 0 &&
                matchingCombos.length === 0 &&
                alsoTry.length === 0 && <div className="empty">{nv.noServiceMatch}</div>
              )}
            </div>
            {(() => {
              const o = pkgDetailsId ? combos.find((x) => x.id === pkgDetailsId) : undefined;
              if (!o) return null;
              const inIt = o.serviceIds
                .map((id) => serviceById.get(id))
                .filter((x): x is Service => Boolean(x))
                .map((x) => ({ id: x.id, name: x.name, priceMinor: x.priceMinor, durationMin: x.durationMin }));
              return (
                <PackageDetails
                  title={o.title}
                  services={inIt}
                  priceMinor={o.comboPriceMinor ?? null}
                  onBill={offerId === o.id}
                  disabled={busy || linesLocked}
                  onToggle={() => (offerId === o.id ? removeCombo() : applyCombo(o))}
                  onClose={() => setPkgDetailsId(null)}
                />
              );
            })()}
            {onPage ? (
              <Pagination
                page={serviceAt}
                total={shownCount}
                pageSize={SERVICES_PER_PAGE}
                noun={servicesNoun.toLowerCase()}
                onChange={setServicePage}
              />
            ) : null}

    </>
  );

  /*
   * A page's branch, and — on Record payment — its moment, in the header.
   *
   * Both used to be fields in the body: a "Which branch?" row, and a Booking date + Booking time pair that were
   * `disabled` on this screen because a payment is always recorded as today, now. Three rows, 170px of a phone,
   * one of them two controls nobody could touch — and the screen came to 858px against a 667px viewport, so
   * Mark done sat below the fold. The branch is still a real `<select>`, now under the title; the moment reads
   * as the words it always was.
   *
   * New booking carries its branch here too (owner, 2026-10-07): it is the context everything below is read in —
   * which clients the search lists, which menu, which people — not an answer typed into the form. Its moment is
   * NOT here, because that screen has a real Booking date and time to set; a clock above them would be a second
   * answer to a question already asked.
   */
  /*
   * A page's footer asks what happens now, where Record payment asks how they paid (owner, 2026-10-07).
   *
   * One row of chips and ONE filled button under them, on both pages. The two competing buttons this replaces
   * needed GRW-458's swap — "Start now" dropped below the queue when no chair was free, because leading with it
   * offered what the branch could not do, and GRW-456 disabled it outright at a branch with nobody on. Chips
   * have no such problem: with no chair free, "Waiting" is simply the chip that arrives chosen.
   */
  // New booking asks this as the first option in the When sheet, so the chips are Record payment's alone.
  const outcomeChips = pageOutcome && !bookForm ? (
    <div className="wi-pay-modes" role="radiogroup" aria-label={nv.whatNow}>
      <span className="wi-pay-modes-label">{nv.whatNow}</span>
      <div className="wi-chips">
        {[
          { value: 'queue' as const, label: nv.outcomeWaiting },
          { value: 'start' as const, label: nv.outcomeStart },
        ].map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={outcome === o.value}
            className={`wi-chip ${outcome === o.value ? 'wi-chip-on' : ''}`}
            onClick={() => setOutcomeWanted(o.value)}
            // Jira GRW-456 — nobody on the branch, or nobody who does this: starting is the one it cannot honour.
            disabled={busy || (o.value === 'start' && (noStaffHere || noOneCanDoIt))}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const pageHead =
    pageForm && (forPayment || branches.length > 1) ? (
      <span className="wi-head-when">
        {branches.length > 1 ? (
          <span className="wi-head-branch">
            {/* What people see. The select on top of it is what they touch: it keeps the phone's own picker, and says nothing here. */}
            <span className="wi-head-pin" aria-hidden="true">
              <IconMapPin />
            </span>
            <span className="wi-head-branch-name" aria-hidden="true">
              {(() => {
                const current = branches.find((b) => b.id === branchId) ?? branches[0];
                if (!current) return null;
                return current.id === branches[0]?.id ? tw('mainSuffix', { name: current.name }) : current.name;
              })()}
            </span>
            <span className="wi-head-chevron" aria-hidden="true">
              <IconChevronDown />
            </span>
            <select
              id="wi-branch"
              aria-label={nv.whichBranch}
              value={branchId ?? ''}
              onChange={(e) => {
                branchTouched.current = true;
                setBranchId(e.target.value);
                // A client belongs to one branch: the one picked from the old branch's list cannot ride along.
                setSelected(null);
              }}
              disabled={busy || linesLocked}
            >
              {branches.map((b, i) => (
                <option key={b.id} value={b.id}>
                  {i === 0 ? tw('mainSuffix', { name: b.name }) : b.name}
                </option>
              ))}
            </select>
          </span>
        ) : null}
        {/* The clock alone: "Now 7:59 AM" said the same thing twice, and the half of it that could be wrong was the clock. */}
        {forPayment ? <span className="wi-head-now">{nowLabel}</span> : null}
      </span>
    ) : null;

  /*
   * Either page asks who BEFORE what (owner, 2026-10-07): the mock puts the stylist directly under the client,
   * above the menu, because at a counter the person is known before the bill is — and the receptionist taking
   * the booking knows who is free before they know what is being had.
   * A sheet keeps it last, after the services it has to be able to do.
   */
  /** One choice of who did it, from either control below: a person, whoever is free, or nobody. */
  const pickStylist = (v: string) => {
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
  };
  const stylistValue = noStylist ? WI_NO_STYLIST : (schedulableId ?? WI_WHOEVER);
  const offersWhoever = !forPayment && !paysToken && !noStaffHere && !noOneCanDoIt;
  /*
   * Record payment: the people as a row of names, one tap each (owner, 2026-10-07), where GRW-524 had made it a
   * dropdown — two taps, and every name hidden until it opened. That dropdown carried what each chair was doing
   * (GRW-198), which matters for who takes a walk-in and not for who DID a visit being paid for, so the till's
   * row is names alone. It wraps rather than scrolls: the kinds of service under it already scroll sideways, and
   * two sideways rows on top of each other read as one. Past six people a wrapped row is taller than the menu it
   * sits over, so a bigger team keeps the dropdown.
   */
  const stylistChips = onPage && ableProviders.length <= STYLIST_CHIPS_MAX;
  /**
   * What the chair is doing, short enough to sit under a name (owner, 2026-10-07 — the two pages align).
   *
   * GRW-198 put this in the control because "who can take this person" is the receptionist's actual question and
   * a bare list of names made them guess. Moving New booking to the till's chips would have thrown it away, so
   * it comes along: "free now", or the time they are free at. Never on Record payment — the work is already
   * done there, and what a chair is doing now says nothing about who did it.
   */
  const chairLine = (id: string): string | null => {
    if (forPayment || later) return null;
    const chair = chairs.find((c) => c.schedulableId === id);
    if (!chair) return null;
    return chair.free ? nv.chairFree : nv.chipBusy(clockTime(chair.occupant!.freesAt));
  };

  const stylistField = (
    <>
            {/* On the till the row speaks for itself ("Stylist · whoever is free"), so the heading above it is just height. */}
            {onPage ? null : (
              <h2 className="wi-section-label" id="wi-stylist-label">{nv.withWhom(providerNoun.toLowerCase())}</h2>
            )}
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
            {stylistChips ? (
              /*
                The noun sits OUTSIDE the scrolling row (owner, 2026-10-07). It was the row's first item, held in
                place with `position: sticky` — and a sticky item inside its own scroller is drawn OVER what
                scrolls past it, so the row arrived with "Stylist" printed across "Whoever is free". Out here it
                cannot collide with anything: the names scroll in the space left beside it.
              */
              <div className="wi-stylist-bar">
                <span className="wi-stylist-chips-label" aria-hidden="true">
                  {providerNoun}
                </span>
                <div id="wi-stylist" className="wi-chips wi-stylist-chips" role="radiogroup" aria-label={nv.withWhom(providerNoun.toLowerCase())}>
                {[
                  ...(offersWhoever
                    ? [
                        {
                          value: WI_WHOEVER,
                          label: nv.whoeverIsFree,
                          photoUrl: null,
                          // How many are free is for choosing who TAKES this person. A payment is for work already done.
                          under: forPayment || later || freeCount === null ? null : nv.freeCount(freeCount),
                        },
                      ]
                    : []),
                  ...ableProviders.map((p) => ({ value: p.id, label: p.displayName, under: chairLine(p.id), photoUrl: p.photoUrl })),
                ].map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={stylistValue === o.value}
                    className={`wi-chip ${o.under ? 'wi-chip-two' : ''} ${o.photoUrl ? 'wi-chip-faced' : ''} ${stylistValue === o.value ? 'wi-chip-on' : ''}`}
                    // On Record payment a second tap on the chosen name puts it back to nobody; there is no chip for that any more.
                    onClick={() => pickStylist(forPayment && stylistValue === o.value ? WI_NO_STYLIST : o.value)}
                    disabled={busy || linesLocked}
                  >
                    {/*
                      Jira GRW-559 — the face in front of the name, and ONLY when there is one. The
                      row stays what the owner settled on 2026-10-07: people as names, one tap each.
                      A chip with no photo renders exactly the markup it did before, so a salon that
                      has photographed nobody sees no change at all.

                      The two-line variant is `flex-direction: column`, so the name and its "free
                      now" line have to be stacked INSIDE their own box — an <img> dropped in as a
                      sibling would sit above the name and make every chip two rows taller.
                    */}
                    {o.photoUrl ? (
                      <>
                        {/*
                          A photo that does not load leaves the browser's broken-image glyph in front of the
                          name — a torn page where a face should be, on every chip, for as long as the file is
                          missing. The chip then reads as the photoless one it already knows how to be.
                        */}
                        <img
                          className="wi-chip-face"
                          src={o.photoUrl}
                          alt=""
                          onError={(e) => {
                            e.currentTarget.hidden = true;
                          }}
                        />
                        <span className="wi-chip-lines">
                          {o.label}
                          {o.under ? <span className="wi-chip-under">{o.under}</span> : null}
                        </span>
                      </>
                    ) : (
                      <>
                        {o.label}
                        {/* Read as one name by a screen reader: "Rahul free now" is the sentence, not two labels. */}
                        {o.under ? <span className="wi-chip-under">{o.under}</span> : null}
                      </>
                    )}
                  </button>
                ))}
                </div>
              </div>
            ) : (
            <select
              id="wi-stylist"
              className={`wi-stylist-select ${onPage ? 'wi-stylist-row' : ''}`}
              aria-label={onPage ? nv.withWhom(providerNoun.toLowerCase()) : undefined}
              aria-labelledby={onPage ? undefined : 'wi-stylist-label'}
              value={stylistValue}
              onChange={(e) => pickStylist(e.target.value)}
              disabled={busy || linesLocked}
            >
              {forPayment && <option value={WI_NO_STYLIST}>{onPage ? `${providerNoun} · ${noProviderWord}` : noProviderWord}</option>}
              {offersWhoever && (
                <option value={WI_WHOEVER}>
                  {/*
                    With no heading above it (the till), "Whoever is free" alone does not say what it is choosing.
                    The noun goes on this option and on "No stylist" — the two that are not a person's name — so the
                    closed row reads "Stylist · whoever is free" without repeating the word down an open list.
                  */}
                  {onPage ? `${providerNoun} · ` : ''}
                  {!later && freeCount !== null ? `${nv.whoeverIsFree} · ${nv.freeCount(freeCount)}` : nv.whoeverIsFree}
                </option>
              )}
              {ableProviders.map((p) => {
                const chair = later ? null : chairs.find((c) => c.schedulableId === p.id);
                const state = !chair
                  ? ''
                  : chair.free
                    ? nv.chairFree
                    : nv.chairBusy(chair.occupant?.customerName ?? nv.someone, clockTime(chair.occupant!.freesAt));
                return (
                  <option key={p.id} value={p.id}>
                    {state ? `${p.displayName} · ${state}` : p.displayName}
                  </option>
                );
              })}
            </select>
            )}

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

    </>
  );

  const servicesAndStylist = (
    <>
            {onPage ? stylistField : null}

            {/* Either page: the search sits above what has been chosen, so adding a service never means scrolling past the list. */}
            {onPage && serviceSearch}

            {/* Chosen list first — it is the answer being assembled. */}
            {(picked.length > 0 || extras.length > 0) && (
              <>
                {/* Record payment calls it the bill, and says beside it that the money taken need not match these prices. */}
                {payPage ? (
                  <div className="wi-bill-head" id="wi-bill">
                    <h2 className="wi-section-label">{nv.inThisBill(picked.length + extras.length)}</h2>
                    <span className="wi-bill-hint">
                      {nv.totalCanDiffer(tmin('minutes', { count: totalMinutes([...picked, ...extras]) }))}
                    </span>
                  </div>
                ) : (
                  <h2 className="wi-section-label">{nv.picked}</h2>
                )}
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
                      <span className="wi-picked-name">{numberedName(extras, i)}</span>
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
                          <span className="wi-picked-name">{numberedName(picked, i)}</span>
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

            {!onPage && serviceSearch}

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
            {/* On either page the Packages chip above lists them, in the menu; this row is the sheet's. */}
            {!onPage && combos.length > 0 && serviceTerm.trim() === '' && (
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

            {onPage ? null : stylistField}

            {picked.length > 0 && !later && !forPayment && (
              <div className="wi-summary">{nv.startsNow(totalMinutes([...picked, ...extras]))}</div>
            )}

    </>
  );

  /*
   * ── New booking, one question per line (owner, 2026-10-10) ────────────────────────────────────────────────
   *
   * The screen carried eleven controls: a client box, a date, a time, a sideways row of stylists, a service box,
   * a sideways row of kinds, three photo rows, a pager, and a Waiting/Starting pair. Two sideways scrollers
   * stacked on each other, two pagers' worth of browsing, and a menu of fifty-two offered to someone who already
   * knows what they want. It did not fit a 344px phone, and two pairs of controls could contradict each other:
   *
   *   · the Booking time and the free-slot grid both set when the visit starts, and the grid silently moved the
   *     time to "the first free one after it" — the desk promised 2:00 and the salon booked 2:30;
   *   · a stylist and a time could both be chosen and then thrown away by Add to waiting queue, which sends
   *     neither (`queueIt`): Priya was picked, and nothing said she had been dropped.
   *
   * So each question is asked once, on one line, and the line opens the control that answers it. Waiting stops
   * being a chip beside Starting and becomes the FIRST thing the When sheet offers, because a token is simply the
   * answer with no time in it. Record payment keeps its menu untouched — see `bookForm`.
   */
  /**
   * The three answers to "when", and the real times under the third.
   *
   * Waiting first: it is the only answer with no time in it, and a desk with every chair busy wants it before it
   * wants a clock. "Now" is the walk-in. "Pick a time" is what both `dateChosen` and the old Booking time select
   * meant, and it leads to the free-slot grid — the ONE list that knows what is actually free. The quarter-hour
   * select that used to sit above that grid is gone: it did not know, and the grid quietly overruled it.
   */
  const pickWhen = (what: 'queue' | 'now' | 'pick') => {
    setOutcomeWanted(what === 'queue' ? 'queue' : 'start');
    if (what === 'pick') {
      setDateChosen(true);
      return;
    }
    setDateChosen(false);
    setTimeWanted('');
    setSlotUtc(null);
  };
  const whenChoice = (value: 'queue' | 'now' | 'pick', on: boolean, label: string, off = false) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={on}
      className={`wi-when-opt ${on ? 'wi-when-opt-on' : ''}`}
      onClick={() => pickWhen(value)}
      disabled={busy || off}
    >
      {label}
    </button>
  );
  /**
   * What became of the time the desk was given, in one line.
   *
   * Nothing when none was asked for, or when it was free and taken. Otherwise the nearest free time it moved
   * to, or that the day holds nothing after it — the two silences this control used to keep, which are how a
   * desk promised 2:00 and the salon booked 2:30.
   */
  const timeMoved = (() => {
    if (!timeWanted || loadingSlots || !askedMatch || askedMatch.exact) return null;
    const asked = timeOptions.find((o) => o.value === timeWanted)?.label ?? timeWanted;
    return askedMatch.slot ? nv.timeMoved(asked, clockTime(askedMatch.slot.utc)) : nv.timeNoneAfter(asked);
  })();

  const whenChoices = (
    <>
      <h2 className="wi-section-label" id="wi-whatnow">{nv.whatNow}</h2>
      <div className="wi-when-list" role="radiogroup" aria-labelledby="wi-whatnow">
        {/*
          Offered whatever `later` currently is, which `queueOffered` is not: it goes false the moment a time is
          being picked, so choosing "Pick a time", finding the day full and wanting to queue them instead left
          the desk with no way back to Waiting. Tapping it is what UNDOES the time, so it has to outlive it.
        */}
        {canQueue ? whenChoice('queue', queueing, nv.whenWaiting) : null}
        {/* Jira GRW-456 — nobody on the branch, or nobody who does this: starting is the one it cannot honour. */}
        {whenChoice('now', !queueing && !later, nv.whenNow, noStaffHere || noOneCanDoIt)}
        {whenChoice('pick', !queueing && later, nv.whenPick)}
      </div>

      {!queueing && later ? (
        <>
          {/* Jira GRW-529 — the day and the time share one row, as they always did on this screen. */}
          <div className="wi-when wi-when-date">
            <div className="field wi-date-field">
              <label htmlFor="wi-date">{nv.bookingDate}</label>
              <input
                id="wi-date"
                type="date"
                min={todayIso}
                value={day}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = !v || v < todayIso ? todayIso : v;
                  setDay(next);
                  // Never back to a walk-in from in here: "Pick a time" is the answer being given, and today's
                  // date is "later today". Clearing it is what the Starts now box above is for.
                  setDateChosen(true);
                  // Jira GRW-535 — a morning time chosen for tomorrow is dropped when the date comes back to
                  // today and it has passed. Only here: a clock tick never clears a time just picked.
                  if (next === todayIso && timeWanted && timeWanted < nowHm) setTimeWanted('');
                }}
              />
            </div>

            {/*
              Jira GRW-527 · GRW-533, back by the owner's ask (2026-10-10) — the time the desk was GIVEN.
              A quarter-hour list, never a typed box, so a time that has passed is not in it.

              It is a wish, not the answer: the answer is `slotUtc`, picked from what is actually free. This
              control used to be removed precisely because the grid moved the wish on to "the first free one
              after it" and said nothing, so the desk promised 2:00 and the salon booked 2:30. It keeps its job
              — jump the grid to the time asked for — and the line under the grid now says when it could not.
            */}
            <div className="field wi-date-field">
              <label htmlFor="wi-time">{nv.bookingTime}</label>
              <select id="wi-time" value={timeWanted} onChange={(e) => setTimeWanted(e.target.value)} disabled={busy}>
                <option value="">{nv.anyTime}</option>
                {timeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* The grid needs a duration to fit, so it waits for the first service — and says so rather than sitting empty. */}
          {picked.length === 0 ? (
            <div className="empty">{nv.servicesMissing}</div>
          ) : (
            <>
              {slotError && <div role="alert" className="wi-error">{slotError}</div>}
              <h3 className="wi-section-label">{nv.whichTime}</h3>
              {loadingSlots ? (
                <div className="empty">{nv.loadingTimes}</div>
              ) : !slots || slots.slotCount === 0 ? (
                <div className="empty" id="wi-no-times">
                  {nv.noTimes}
                </div>
              ) : timeMoved ? (
                <div className="wi-time-moved" role="status" id="wi-time-moved">
                  {timeMoved}
                </div>
              ) : null}
              {!loadingSlots && slots && slots.slotCount > 0 ? (
                <div className="wi-slot-grid" role="group" aria-label={nv.whichTime}>
                  {slots.sections.flatMap((sec) =>
                    sec.slots.map((slot) => (
                      <button
                        key={slot.utc}
                        type="button"
                        aria-pressed={slotUtc === slot.utc}
                        className={`wi-slot ${slotUtc === slot.utc ? 'wi-slot-on' : ''}`}
                        onClick={() => setSlotUtc(slot.utc)}
                        disabled={busy}
                      >
                        {slot.local}
                      </button>
                    )),
                  )}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </>
  );

  /*
   * What the visit comes to at the MENU's prices.
   *
   * Not `billTotalMinor`: that is Record payment's total, the sum of the amounts typed into each line at the
   * till, and nothing is typed on this screen — the Services row read "1 service · ₹0" beside a line saying
   * ₹300. A booking is quoted at list price, and a combo at the combo's price, which is what `totalMinor` does.
   */
  const bookTotalMinor = totalMinor(everything, comboActive ? comboPriceMinor : null);

  /** What the stylist row says: a person and what they are doing, or whoever is free and how many that is. */
  const stylistAnswer = (() => {
    if (noStylist) return noProviderWord;
    const chosen = schedulableId ? ableProviders.find((p) => p.id === schedulableId) : null;
    if (chosen) {
      const line = chairLine(chosen.id);
      return line ? `${chosen.displayName} · ${line}` : chosen.displayName;
    }
    return !later && freeCount !== null ? `${nv.whoeverIsFree} · ${nv.freeCount(freeCount)}` : nv.whoeverIsFree;
  })();

  /*
   * A picture in front of every row (owner, 2026-10-10).
   *
   * The screen this replaces had three service photographs on it, and a receptionist who is not a confident
   * reader worked it by recognising them. Folding the menu into a sheet took that away and left two words to
   * read where a picture had been, which is a worse screen for the person who needs the most help — the words
   * got shorter and there were fewer of them, but the one thing that needed no reading at all was gone.
   *
   * So each row opens with a 36px tile in the same place: the service's own photograph once one is chosen, the
   * stylist's face once there is one, and otherwise the icon for what the row is about. The tile is
   * `aria-hidden` — it repeats the answer beside it, and a screen reader does not want it twice.
   */
  const rowPhoto = (src: string | null, icon: ReactNode) => (
    <span className="wi-row-photo" aria-hidden="true">
      {src ? (
        <img
          src={src}
          alt=""
          width={36}
          height={36}
          /* A photo that does not load leaves the browser's torn-page glyph where a face should be. */
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      ) : (
        <span className="wi-row-icon">{icon}</span>
      )}
    </span>
  );

  /** The first service on the visit, as a picture: what the row shows once there is something on it. */
  const firstPickedPhoto = (() => {
    const first = everything[0];
    const service = first ? serviceById.get(first.serviceId) : undefined;
    return service ? servicePhotoUrl(service) : null;
  })();
  /** The chosen stylist's own face, when the salon has photographed them. */
  const chosenStylistPhoto = (schedulableId && ableProviders.find((p) => p.id === schedulableId)?.photoUrl) || null;

  /** One line: a picture, what it asks, what it has been answered with, and a chevron saying it opens. */
  const bookRow = (
    key: 'services',
    label: string,
    answer: string,
    photo: ReactNode,
    empty = false,
  ) => (
    <button
      type="button"
      className={`wi-row-btn ${empty ? '' : 'wi-row-done'}`}
      onClick={() => setAsking(key)}
      disabled={busy}
    >
      {photo}
      <span className="wi-row-text">
        <span className="wi-row-label">{label}</span>
        <span className={`wi-row-answer ${empty ? 'wi-row-empty' : ''}`}>{answer}</span>
      </span>
      <span className="wi-row-chevron" aria-hidden="true">
        <IconChevronRight />
      </span>
    </button>
  );

  /*
   * The stylist is a dropdown, not a door to a sheet (owner, 2026-10-10).
   *
   * Services and When are lists worth a screen — fifty-two of one, a date and a free-slot grid of the other. A
   * salon's people are three or four names, and GRW-524 already settled that shape for the till: a sheet to
   * choose between four things is a screen's worth of ceremony for one tap.
   *
   * Drawn as the row beside it so the three line up, with a real `<select>` laid over the whole thing at
   * `opacity: 0` — the same trick the branch picker in the header uses. What it costs: nothing. What it buys:
   * the phone's own wheel, which a receptionist has used ten thousand times, instead of ours.
   */
  /* Always answered — "Anyone free" is a real answer, not an empty row — so `wi-row-done` is unconditional. */
  const stylistRow = (
    <div className={`wi-row-btn wi-row-select wi-row-done ${busy ? 'wi-row-off' : ''}`}>
      {rowPhoto(chosenStylistPhoto, <IconUser />)}
      <span className="wi-row-text" aria-hidden="true">
        <span className="wi-row-label">{providerNoun}</span>
        <span className="wi-row-answer">{stylistAnswer}</span>
      </span>
      <span className="wi-row-chevron" aria-hidden="true">
        <IconChevronDown />
      </span>
      <select
        id="wi-stylist"
        aria-label={nv.withWhom(providerNoun.toLowerCase())}
        value={stylistValue}
        onChange={(e) => pickStylist(e.target.value)}
        disabled={busy}
      >
        {offersWhoever && (
          <option value={WI_WHOEVER}>
            {!later && freeCount !== null ? `${nv.whoeverIsFree} · ${nv.freeCount(freeCount)}` : nv.whoeverIsFree}
          </option>
        )}
        {/* What each chair is doing, in the option's own words (GRW-198): the desk's real question is who can take this person. */}
        {ableProviders.map((p) => {
          const line = chairLine(p.id);
          return (
            <option key={p.id} value={p.id}>
              {line ? `${p.displayName} · ${line}` : p.displayName}
            </option>
          );
        })}
      </select>
    </div>
  );

  const bookRows = (
    <div className="wi-rows">
      {bookRow(
        'services',
        servicesNoun,
        billCount > 0 ? nv.rowPicked(billCount, formatMoney(bookTotalMinor)) : nv.rowAddService,
        rowPhoto(firstPickedPhoto, <IconScissors />),
        billCount === 0,
      )}
      {/* What is on the visit, under the row that chose it: the bill assembling itself where it was asked for. */}
      {billCount > 0 ? (
        <div className="wi-row-lines">
          {everything.map((p, i) => (
            <div key={`${p.serviceId}-${i}`} className="wi-row-line">
              <span className="wi-row-line-name">{numberedName(everything, i)}</span>
              <span className="wi-row-line-price">{formatMoney(p.priceMinor ?? '0')}</span>
            </div>
          ))}
        </div>
      ) : null}
      {/*
        A token has no stylist: `queueIt` posts the client, the services and the branch, and nothing else. The row
        was answerable and the answer was silently dropped, so while Waiting is the answer the row is not there.
      */}
      {queueing ? null : stylistRow}
      {/*
        When is not a row (owner, 2026-10-10). It was, and putting the queue behind it was the mistake: adding
        somebody to the waiting list is the commonest thing a busy desk does, and it had become two taps down
        inside a line reading "Now · 9:14 PM" — which also said the time twice, once as a word and once as a
        clock nobody needed. Three answers deserve three boxes, the same argument the stylist dropdown won on,
        and they sit directly above the button they name so the two can never read differently.
      */}
      {whenChoices}
    </div>
  );

  /** The question that is open, over the form it was opened from. */
  const askSheet = (() => {
    if (!bookForm || !asking) return null;
    /*
     * Services is the till's own search (owner, 2026-10-10) — `ServiceSheet`, the sheet Record payment's simple
     * flow opens from its search box, not the full form's paged photo menu. One box, the kinds beside it, one
     * list of rows with a count on each. The desk already knows it; it is the same catalogue; and a visit is
     * often two or three services, so `onPick` here does NOT close — the count goes up and the next one is a
     * tap away, where the till closes because its tiles are the main path back.
     */
    if (asking === 'services' && services) {
      return (
        <ServiceSheet
          services={services}
          counts={new Map(services.map((x) => [x.id, countOnBill(x.id)]))}
          onPick={addOneMore}
          packages={combos}
          packageOnBillId={offerId}
          onPickPackage={(o) => (offerId === o.id ? removeCombo() : applyCombo(o))}
          onClose={() => setAsking(null)}
        />
      );
    }
    return null;
  })();

  const asPage = presentation === 'page';
  /** A token being paid stays the token being paid when the form is switched, so its id rides in the address. */
  const payTokenQuery = token ? `&token=${encodeURIComponent(token.id)}${token.locationId ? `&location=${encodeURIComponent(token.locationId)}` : ''}` : '';
  // Jira GRW-520 — every row the dropdown can show, in order: this branch's matches, then the other branches'.
  const comboOptions = [
    ...results.map((c) => ({ c, bring: false })),
    ...elsewhere.map((c) => ({ c, bring: true })),
  ];
  const showDrop = comboOpen && term.trim().length >= SEARCH_MIN_CHARS;
  /*
   * Either page keeps the Name and Phone number fields closed — but never while they have something to say.
   *
   * "Nobody on file matches that" is the moment they are wanted: the dropdown saying it sits directly over the
   * button that would open them, so a closed block there is a dead end. A number already typed, or an error on
   * either field, would likewise be hidden behind the button.
   *
   * New booking closed them too (owner, 2026-10-07). It is the same question in the same place, and the screen
   * opened on two empty fields for a client who, most of the time, is already on file — and who, when they are
   * not, opens the fields by the search failing to find them.
   */
  const nobodyMatched =
    term.trim().length >= SEARCH_MIN_CHARS && !searching && results.length === 0 && elsewhere.length === 0;
  const newPersonClosed =
    pageForm && !addingNew && !nobodyMatched && !newPhone.trim() && !nameError && phoneError === null;
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
    // The single page keeps its form on screen after a failed save: Back leaves the page, as it does from the form.
    if (pageForm && stage.step === 'error') {
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

  /*
   * Owner, 2026-10-10 — after a payment the page IS the done screen, exactly as the three-tap flow ends: no form
   * header, no card, no close cross around it. Only a sheet (an overlay somewhere else) keeps its frame.
   */
  const paidScreen =
    stage.step === 'paid' ? (
      <PaymentDone
        appointmentId={stage.result.appointmentId}
        fixHref={fixVisitHref(stage.result.appointmentId, new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(stage.result.startAt)))}
        totalMinor={stage.totalMinor}
        mode={stage.mode}
        modeLabel={PAYMENT_MODES.some((m) => m.value === stage.mode) ? tcr(`pay.${stage.mode}`) : stage.mode}
        summary={[
          // Jira GRW-403 — the token this payment closed, or the one it was given.
          stage.result.tokenNo ? nv.token(stage.result.tokenNo) : null,
          PAYMENT_MODES.some((m) => m.value === stage.mode) ? tcr(`pay.${stage.mode}`) : stage.mode,
          everythingNamed,
          providers?.find((p) => p.id === stage.result.schedulableId)?.displayName ?? null,
        ]
          .filter(Boolean)
          .join(' · ')}
        bill={stage.bill}
        phone={stage.client.phone || null}
        onNextCustomer={onAnother ?? onClose}
        onDone={onClose}
      />
    ) : null;
  if (paidScreen && presentation === 'page') return paidScreen;

  return (
    <>
      {/* Jira GRW-478 (U-4) — once a client or a service is picked, a stray tap above the sheet keeps the visit; Close shuts it. */}
      {largeAmountDialog}
      {/* New booking's open question, over the form: the menu, the people, or when. */}
      {askSheet}
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
            {pageHead ? null : <div className="sheet-sub">{headSub}</div>}

          </div>
          {/*
            One way out, not two (owner, 2026-10-09). A pop-up is closed by its ✕; a page is left by its back
            arrow. On the routed page both were drawn, 250px apart, and they went to DIFFERENT places — ← to
            whatever opened the page, ✕ always Home — with nothing on either to say which. The ✕ stays on the
            steps where there is nowhere to go back to, so a page is never left with no exit at all.
          */}
          {/*
            The way back to the three-tap screen (owner, 2026-10-10).
            This page is reached by `?full=1` from it, and until now the only way out was the browser's own
            Back — a one-way door. The same switch stands on both sides, and in the same corner on both.
            It takes the slot the ✕ would use, which on this page is an empty 44px span anyway because the
            back arrow is the way out. Phones only (CSS): at a desk this IS the form for Record payment, so
            there is nothing to switch to.
          */}
          {forPayment && asPage && goBack ? (
            <FormModeSwitch now="advanced" simpleHref={`/appointments/new?purpose=payment${payTokenQuery}`} advancedHref={`/appointments/new?purpose=payment&full=1${payTokenQuery}`} />
          ) : asPage && goBack ? (
            <span className="wi-close-gap" aria-hidden="true" />
          ) : (
            <button type="button" className="wi-close" aria-label={nv.close} onClick={onClose} disabled={busy}>
              <IconClose />
            </button>
          )}
          {/*
            A row of its own, not the middle cell's sub-line: `.sheet-head` is `1fr auto 1fr`, so between a back
            arrow and a ✕ the middle cell is about 230px at 375 and the branch name came out as "MG Road…".
            Spanning all three columns gives the name the header's full width.
          */}
          {pageHead}
        </div>

        {/* ---------- Stage 1: find them ---------- */}
        {(stage.step === 'client' || (pageForm && onForm)) && (
          <div className="wi-body" id="wi-client-panel">
            {pageForm && stage.step === 'error' && <div role="alert" className="wi-error">{stage.message}</div>}
            {pageForm && tokenGone && <div role="alert" className="wi-error">{nv.tokenGone}</div>}
            {/*
              Jira GRW-520 — a combobox: the matches float in a dropdown under the box instead of pushing the
              form down. Pointer-down on the dropdown is kept from taking focus off the input, so a tap on a row
              is not preceded by the box losing focus and the dropdown closing under the finger (iOS gives a
              button no focus, so that blur arrives with no related target).
            */}
            {/* Either page's branch is in the header (`pageHead`), not here. */}

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
                  placeholder={!selected && newPersonClosed ? `${nv.searchPlaceholder} *` : nv.searchPlaceholder}
                  aria-required={pageForm || forPayment ? true : undefined}
                  aria-label={nv.searchPlaceholder}
                  value={term}
                  ref={searchRef}
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
                    // A number is never a name: its first digits used to land in Name and stay there once the rest
                    // arrived (9599420200 left "959942" in Name), so a numeric search clears a name it seeded.
                    if (isNumberLike(typed)) {
                      if (!nameEdited.current) setNewName('');
                      if (!phoneEdited.current) setNewPhone(digitsOf(typed).length >= 7 ? typed : '');
                    } else if (!nameEdited.current) {
                      setNewName(typed);
                      if (!phoneEdited.current) setNewPhone('');
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
              {pageForm && selected ? (
                <>
                <div className="wi-picked-row">
                  <span className="wi-picked-name">
                    {selected.name?.trim() || nv.noName}
                    {selected.phone ? <span className="picker-row-meta"> · {selected.phone}</span> : null}
                  </span>
                  <button type="button" className="wi-remove" aria-label={nv.clear} onClick={() => setSelected(null)} disabled={busy}>
                    <IconClose />
                  </button>
                </div>
                {/* On file with a name and no number, and they give one now: it goes onto their record with the visit. */}
                {selected.kind === 'existing' && !selected.phone ? (
                  addingPhone || pickedPhone.trim() || pickedPhoneError ? (
                    <PhoneField
                      id="wi-picked-phone"
                      label={nv.phoneRequired}
                      value={pickedPhone}
                      onChange={(v) => {
                        setPickedPhone(v);
                        if (pickedPhoneError) setPickedPhoneError(null);
                      }}
                      error={pickedPhoneError}
                      autoFocus={autoFocusField(addingPhone && !pickedPhone)}
                      /* Not `busy`: that includes saving this number, and a field disabled while its own save fails
                         cannot take the focus that is sent back to it with the reason. */
                      disabled={stage.step === 'saving'}
                    />
                  ) : (
                    <button type="button" className="wi-add-person" onClick={() => setAddingPhone(true)} disabled={busy}>
                      {nv.addPhoneNumber}
                    </button>
                  )
                ) : null}
                </>
              ) : newPersonClosed ? (
                /* Closed on Record payment until it is wanted. Never while it has something to say: a number already
                   typed, or an error on either field, each of which would otherwise be hidden behind this button. */
                <button type="button" className="wi-add-person" onClick={() => setAddingNew(true)} disabled={busy}>
                  {nv.addNameAndNumber}
                </button>
              ) : (
                <>
              <div className="field">
                <label htmlFor="wi-name">
                  <span>
                    {nv.nameRequired}
                    <span className="field-required" aria-hidden="true"> *</span>
                  </span>
                </label>
                <input
                  id="wi-name"
                  type="text"
                  aria-required="true"
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
                </>
              )}

              {/* Jira GRW-341 — a returning client: last time's visit, and the next free times. */}
              {pageForm && !forPayment && selected?.kind === 'existing' && picked.length === 0 && extras.length === 0 && services && providers && offers ? (
                <BookAgainCard
                  clientId={selected.id}
                  services={services}
                  providers={branchProviders}
                  offers={combos}
                  branchId={listBranch}
                  days={days.map((d) => d.iso)}
                  timezone={timezone}
                  later={later}
                  onUse={(plan) => applyPlan(plan)}
                  onPickTime={(plan, time) => bookAgainAt(selected, plan, time)}
                />
              ) : null}

              {/*
              Jira GRW-518 · GRW-519 · GRW-521 — the Booking date, last: search, name, phone, then when. It shows
              today. Today is a walk-in now; a later day is a booking for that day (and needs a phone). Never
              before today; set back to today, or cleared, it is a walk-in again.
            */}
            {/* Jira GRW-529 — date and time share one row. */}
            {/* Record payment never asks: both controls were `disabled` here, and the header says "Now 10:51 PM" instead. */}
            {/* New booking asks it once, inside the When row, where the free-slot grid is there to answer it properly. */}
            {forPayment || bookForm ? null : (
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
            )}

            {pageForm ? (
              <>
                {bookForm ? bookRows : servicesAndStylist}

                {/* Free times for what was chosen, once there is something to fit: the booking time asked for above is picked if it is free. */}
                {later && picked.length > 0 && !bookForm ? (
                  <>
                    {slotError && <div role="alert" className="wi-error">{slotError}</div>}
                    <h2 className="wi-section-label">{nv.whichTime}</h2>
                    {loadingSlots ? (
                      <div className="empty">{nv.loadingTimes}</div>
                    ) : !slots || slots.slotCount === 0 ? (
                      <div className="empty" id="wi-no-times">
                        {nv.noTimes}
                      </div>
                    ) : (
                      <div className="wi-slot-grid" role="group" aria-label={nv.whichTime}>
                        {slots.sections.flatMap((sec) =>
                          sec.slots.map((slot) => (
                            <button
                              key={slot.utc}
                              type="button"
                              aria-pressed={slotUtc === slot.utc}
                              className={`wi-slot ${slotUtc === slot.utc ? 'wi-slot-on' : ''}`}
                              onClick={() => setSlotUtc(slot.utc)}
                              disabled={busy}
                            >
                              {slot.local}
                            </button>
                          )),
                        )}
                      </div>
                    )}
                  </>
                ) : null}

                <div className={`modal-actions wi-actions wi-acts ${forPayment ? 'wi-pay-actions' : ''}`}>
                  {/* Record payment: how they paid sits in the tray beside Mark done (GRW-290). */}
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
                            className={`wi-chip wi-pay-tile ${paymentMode === m.value ? 'wi-chip-on' : ''}`}
                            onClick={() => setPaymentMode(m.value)}
                            disabled={busy}
                          >
                            <span className={`wi-pay-icon wi-pay-icon-${m.value}`} aria-hidden="true">{PAY_ICONS[m.value]}</span>
                            {tcr(`pay.${m.value}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {outcomeChips}
                  {(() => {
                    // Record payment has an answer with nobody on the branch (no stylist); a walk-in or booking does not.
                    const cannot = (later && !slotUtc) || (forPayment ? !amountsValid : noStaffHere || noOneCanDoIt);
                    /*
                     * One button, named by the chip above it. Queueing asks for less than starting does — a person
                     * can wait before anybody has decided what they are having, so it does not want a service, a
                     * free chair, or somebody who can do it.
                     */
                    const go = (
                      <button
                        key="go"
                        type="button"
                        className="btn"
                        onClick={() => void thenVisit(forPayment ? checkBeforeMarkDone() : pageClient(), queueing ? queueIt : submit)}
                        disabled={queueing ? busy : busy || (forPayment ? false : picked.length === 0 || cannot)}
                      >
                        {busy
                          ? nv.saving
                          : forPayment
                            ? nv.markDone
                            : later
                              ? bookForm && slotUtc
                                ? nv.bookAt(clockTime(slotUtc))
                                : nv.bookIt
                              : queueing
                                ? nv.addToQueue
                                : nv.start}
                      </button>
                    );
                    return trayTotal ? <div className="wi-tray-row">{trayTotal}{go}</div> : go;
                  })()}
                </div>
              </>
            ) : null}

            {!pageForm && (
              <>
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
              </>
            )}
            </div>
          </div>
        )}

        {/* ---------- Stage 2: what are they having ---------- */}
        {!pageForm && (stage.step === 'details' || stage.step === 'saving' || stage.step === 'error') && (
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

            {servicesAndStylist}

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
                        className={`wi-chip wi-pay-tile ${paymentMode === m.value ? 'wi-chip-on' : ''}`}
                        onClick={() => setPaymentMode(m.value)}
                        disabled={busy}
                      >
                        <span className={`wi-pay-icon wi-pay-icon-${m.value}`} aria-hidden="true">{PAY_ICONS[m.value]}</span>
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
                const queueLeads = queueOffered && noChairFree;
                const go = (
                  <button
                    key="go"
                    type="button"
                    className={queueLeads ? 'btn btn-ghost wi-act-alt' : 'btn'}
                    onClick={() => {
                      if (later) return setStage({ step: 'when', client: stage.client });
                      // Paying a token on the Record payment page: the same Mark done as the plain page, which says
                      // what is missing (and takes the eye there) rather than sitting greyed out.
                      if (payPage) {
                        const ready = checkBeforeMarkDone(stage.client);
                        if (ready) void submit(ready);
                        return;
                      }
                      void submit(stage.client);
                    }}
                    // Jira GRW-456 — a walk-in needs a chair and there is none; the queue beside it still takes them.
                    disabled={
                      busy ||
                      (!payPage && picked.length === 0) ||
                      (forPayment && !payPage && !amountsValid) ||
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
                // The bill's total beside Mark done, as on the plain Record payment page.
                if (!queueOffered && trayTotal) return <div className="wi-tray-row">{trayTotal}{go}</div>;
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
        {!pageForm && stage.step === 'when' && (
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
            {/* Owner, 2026-10-07 — the same hand-over as the bill: the token to send, if they gave a number. */}
            {stage.confirm ? <ReceiptShare bill={stage.confirm} phone={stage.client.phone || null} kind="confirm" /> : null}
            <button type="button" className={`sheet-item wi-finish ${stage.confirm ? 'wi-finish-quiet' : ''}`} onClick={onClose}>
              {nv.done}
            </button>
          </div>
        )}

        {/* ---------- Stage 3p: paid (Jira GRW-290) ---------- */}
        {/*
          Owner, 2026-10-10 — the SAME done screen as the three-tap flow, not a look-alike: the amount said out loud,
          the chime, Next customer, keeping a number typed here. `PaymentDone` is that screen; both forms render it.
        */}
        {stage.step === 'paid' && presentation !== 'page' ? paidScreen : null}

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
                    ? `${formatDateWithWeekday(stage.result.startAt, timezone, { withYear: false, locale })} · ${clockTime(stage.result.startAt)} · `
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
                {/*
                  Owner, 2026-10-10 — Record payment, not a till of its own.
                  Taking money is one job, and the desk should meet one screen doing it whether the person
                  walked in or was booked. The visit's own day rides in the address because there is no read
                  for one appointment by id; `?visit=` fills the flow in from it and settles it with
                  `checkout`, never a second sale.
                */}
                <button
                  type="button"
                  className="sheet-item wi-take-payment"
                  onClick={() => router.push(payVisitHref(stage.result, timezone))}
                >
                  {nv.takePayment}
                </button>
              </>
            )}
            {/*
              Owner, 2026-10-07 — and the booking itself, to send: the day and time are what the client has to
              remember, and until now they were read out at the counter and nowhere else.
            */}
            {stage.confirm ? <ReceiptShare bill={stage.confirm} phone={stage.client.phone || null} kind="confirm" /> : null}
            <button type="button" className={`sheet-item wi-finish ${stage.confirm ? 'wi-finish-quiet' : ''}`} onClick={onClose}>
              {nv.done}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
