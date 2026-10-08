'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  BookingConflictError,
  formatMoney,
  type CreatedOffer,
  type Offer,
  type OfferInput,
  type Service,
} from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconCalendar, IconClock, IconUser } from '../components/icons';
import { useDialog } from '../../shared/a11y/useDialog';
import { OfferBranchField, useDefaultOfferBranch } from '../offers/OfferBranchField';
import { useBranch } from '../components/BranchProvider';
import { servicePhotoUrl } from '../lib/service-photos';
import { weekdayNames } from '../lib/weekday-names';
import { clampPercentInput, percentOff, pricedMinor, type PriceMode } from './packages-logic';
import { durationPhrase } from '../lib/duration-words';
import { ServicePickerSheet } from './ServicePickerSheet';

/**
 * Making or editing a package: ONE page, in the grouped-form language the service sheet already speaks
 * (`98-service-sheet.css` — inset white groups, 44px rows, a footnote under the group it explains).
 *
 * It was a three-step wizard, and the steps were the problem (owner, 2026-10-08). Step 1 held four jobs — name,
 * branch, every service, the price — while steps 2 and 3 held one small thing each, so a screen that had to fit a
 * phone was being shrunk a label at a time while two near-empty screens sat behind it. What replaced it is what a
 * Shopify or Stripe editor does: one scrolling page, create and edit the same screen, the long list moved into a
 * sheet of its own (`ServicePickerSheet`), the scheduling collapsed into a row that says its own answer, and the
 * preview a thing you open rather than a stage you pass. An editor is allowed to scroll; a list screen is not.
 */

const TITLE_MAX = 60;
const TAGLINE_MAX = 80;

type VisibilityMode = 'always' | 'weekdays' | 'window';

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function PreviewCard({
  title,
  services,
  description,
  originalPriceMinor,
  comboPriceMinor,
  savingsMinor,
  savingsPct,
  visibilitySummary,
}: {
  title: string;
  services: Service[];
  description: string;
  originalPriceMinor: number;
  comboPriceMinor: number | null;
  savingsMinor: number | null;
  savingsPct: number | null;
  visibilitySummary: string;
}) {
  const t = useTranslations('packages.builder');
  const tm = useTranslations('services');
  const totalMin = services.reduce((sum, s) => sum + s.durationMin, 0);
  /*
   * Jira GRW-446 — "2 hrs 45 min", not "~2.8 hrs". Decimal hours came out of dividing by 60 and rounding to
   * one place; two point eight of an hour is not a length of time anybody can put in a diary, and this is the
   * line the customer reads.
   */
  const formatDuration = (min: number): string =>
    durationPhrase(min, {
      minutes: (count) => tm('minutes', { count }),
      hours: (count) => tm('hours', { count }),
      hoursMinutes: (hours, minutes) => tm('hoursMinutes', { hours, minutes }),
    });
  return (
    <div className="preview-card">
      <div className="preview-body">
        <span className="preview-badge">{t('card.badge')}</span>
        <div className="preview-title">{title || t('untitled')}</div>
        <div className="preview-services">{services.map((s) => s.name).join(' + ')}</div>
        {description && <div className="preview-tagline">{description}</div>}

        {services.length > 1 && (
          <div className="preview-photo-row">
            {services.flatMap((s, i) => [
              i > 0 && (
                <span key={`plus-${s.id}`} className="preview-photo-plus">
                  +
                </span>
              ),
              <span key={s.id} className="preview-photo-item">
                { }
                <img className="preview-photo-avatar" src={servicePhotoUrl(s)} alt="" width={44} height={44} />
                <span className="preview-photo-name">{s.name}</span>
              </span>,
            ])}
          </div>
        )}

        <div className="preview-price-row">
          {/*
            Jira GRW-446 — struck through only when it is actually a saving. The guard used to be "there is a
            price at all", so "Sum of parts" drew ₹3,750 crossed out beside ₹3,750, and a package priced ABOVE
            its parts drew ₹3,750 crossed out beside ₹5,000 — a markup in the visual language of a discount, on
            the panel that says "See how customers see it". The saved card had it right; this did not.
          */}
          {comboPriceMinor != null && comboPriceMinor < originalPriceMinor && (
            <span className="preview-price-original">{formatMoney(String(originalPriceMinor))}</span>
          )}
          <span className="preview-price-combo">{formatMoney(String(comboPriceMinor ?? originalPriceMinor))}</span>
          {savingsPct != null && savingsPct > 0 && <span className="chip chip-confirmed">{t('card.pctOff', { pct: savingsPct })}</span>}
        </div>
        {savingsMinor != null && savingsMinor > 0 && (
          <div className="savings-banner" style={{ marginTop: 10 }}>
            {t('card.youSave', { amount: formatMoney(String(savingsMinor)) })}
          </div>
        )}

        <div className="preview-facts">
          <div className="preview-fact">
            <span className="preview-fact-icon">
              <IconCalendar />
            </span>
            {visibilitySummary}
          </div>
          {totalMin > 0 && (
            <div className="preview-fact">
              <span className="preview-fact-icon">
                <IconClock />
              </span>
              {t('card.takes', { duration: formatDuration(totalMin) })}
            </div>
          )}
          <div className="preview-fact">
            <span className="preview-fact-icon">
              <IconUser />
            </span>
            {t('card.byAnyStaff')}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The preview a phone opens, where a laptop has it beside the form the whole time. */
function PreviewSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations('packages.builder');
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal sheet pv-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('sidebarPreview')}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span />
          <span className="sheet-head-title">{t('sidebarPreview')}</span>
          <button type="button" className="sheet-head-save" onClick={onClose}>
            {t('picker.done')}
          </button>
        </div>
        <div className="sheet-body pv-sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function PackageBuilder({ services: allServices, initialOffer }: { services: Service[]; initialOffer?: Offer }) {
  const t = useTranslations('packages.builder');
  const tl = useTranslations('packages.list');
  const tm = useTranslations('services');
  const locale = useLocale();
  const dayNames = weekdayNames(locale).short;
  const router = useRouter();
  const mode = initialOffer ? 'edit' : 'create';
  const tb = useTranslations('offers.branch');
  /*
   * Jira GRW-381 — a combo runs at ONE branch and is made of that branch's services. A new one opens on the
   * header's branch (the main one on "All"), and may also be published to every other branch as its own copy; an
   * existing one stays at its branch, and another branch changes its own copy.
   */
  const branchContext = useBranch();
  const defaultBranch = useDefaultOfferBranch();
  const [pickedBranch, setPickedBranch] = useState<string | null>(null);
  const atBranch = initialOffer?.locationId ?? pickedBranch ?? defaultBranch;
  const [allBranches, setAllBranches] = useState(false);
  const [published, setPublished] = useState<CreatedOffer | null>(null);
  /** Jira GRW-435 — the delete confirmation, and why the last attempt was refused. */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const services = useMemo(
    () => allServices.filter((s) => !atBranch || !s.locationId || s.locationId === atBranch),
    [allServices, atBranch],
  );

  /*
   * The one way out of this page. Leaving by `router.push('/packages')` ADDED the list to the history a second time,
   * so the list's own Back arrow stepped to the editor it had just left — the owner pressed Back on Packages and
   * landed on Edit package (owner, 2026-10-08). Stepping back removes the editor from the history instead; a page
   * opened straight from a link has nothing behind it, and goes to the list. Refreshed either way: what was just
   * saved has to be what the list shows.
   */
  const leave = () => {
    if (window.history.length > 1) router.back();
    else router.push('/packages');
    router.refresh();
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [title, setTitle] = useState(initialOffer?.title ?? '');
  const [description, setDescription] = useState(initialOffer?.description ?? '');
  /** The tagline is optional, so it starts as one line of text and opens into a field unless the package already has one. */
  const [taglineOpen, setTaglineOpen] = useState(Boolean(initialOffer?.description));
  const [selectedIds, setSelectedIds] = useState<string[]>(initialOffer?.serviceIds ?? []);

  const initialOriginal = (initialOffer?.serviceIds ?? []).reduce(
    (sum, id) => sum + Number(services.find((s) => s.id === id)?.priceMinor ?? 0),
    0,
  );
  /**
   * Jira GRW-438 — a package already priced at exactly its parts total opens in "Sum of parts", not in
   * "Fixed" showing that figure. Otherwise the owner who chose no discount is shown an amount to edit and
   * has no way to tell which decision they made.
   */
  const [priceMode, setPriceMode] = useState<PriceMode>(
    initialOffer?.comboPriceMinor != null && initialOriginal > 0 && Number(initialOffer.comboPriceMinor) === initialOriginal
      ? 'sum'
      : 'flat',
  );
  const [flatInput, setFlatInput] = useState(
    initialOffer?.comboPriceMinor ? String(Number(initialOffer.comboPriceMinor) / 100) : '',
  );
  const [percentInput, setPercentInput] = useState(
    percentOff(initialOffer?.comboPriceMinor != null ? Number(initialOffer.comboPriceMinor) : null, initialOriginal),
  );

  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>(
    initialOffer?.visibleWeekdays ? 'weekdays' : initialOffer?.visibleFrom || initialOffer?.visibleUntil ? 'window' : 'always',
  );
  const [visibleWeekdays, setVisibleWeekdays] = useState<number[]>(initialOffer?.visibleWeekdays ?? []);
  const [visibleFromInput, setVisibleFromInput] = useState(toDatetimeLocal(initialOffer?.visibleFrom ?? null));
  const [visibleUntilInput, setVisibleUntilInput] = useState(toDatetimeLocal(initialOffer?.visibleUntil ?? null));
  /** Always visible is the answer for almost every package, so the choices stay folded behind the row that states it. */
  const [whenOpen, setWhenOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  // Submission failures only (network/server) — field-level required-ness
  // shows inline next to the field itself, not as a banner up top.
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; services?: string; price?: string }>({});

  const selectedServices = useMemo(
    () => selectedIds.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => !!s),
    [selectedIds, services],
  );
  const originalPriceMinor = selectedServices.reduce((sum, s) => sum + Number(s.priceMinor ?? 0), 0);

  /** Jira GRW-438 — the same arithmetic the list and its tests use, so no two views can disagree by a rupee. */
  const comboPriceMinor = pricedMinor(priceMode, originalPriceMinor, { flat: flatInput, percent: percentInput });

  const savingsMinor = comboPriceMinor != null ? originalPriceMinor - comboPriceMinor : null;
  const savingsPct =
    savingsMinor != null && originalPriceMinor > 0 ? Math.round((savingsMinor / originalPriceMinor) * 100) : null;

  const switchPriceMode = (next: PriceMode) => {
    if (next === priceMode) return;
    // Carry the price across so switching mode never silently changes what the customer pays.
    if (next === 'percent' && comboPriceMinor != null && originalPriceMinor > 0) {
      setPercentInput(percentOff(comboPriceMinor, originalPriceMinor));
    } else if (next === 'flat' && comboPriceMinor != null) {
      setFlatInput(String(comboPriceMinor / 100));
    }
    setPriceMode(next);
  };

  const toggleService = (id: string) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setFieldErrors((e) => (e.services ? { ...e, services: undefined } : e));
  };
  const removeService = (id: string) => setSelectedIds((ids) => ids.filter((x) => x !== id));
  const moveService = (index: number, dir: -1 | 1) => {
    setSelectedIds((ids) => {
      const next = [...ids];
      const target = index + dir;
      if (target < 0 || target >= next.length) return ids;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };
  const toggleWeekday = (day: number) =>
    setVisibleWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()));

  const visibilitySummary = (): string => {
    if (visibilityMode === 'always') return t('summary.always');
    if (visibilityMode === 'weekdays') {
      if (visibleWeekdays.length === 0) return t('summary.pickDay');
      return tl('onlyOn', { days: visibleWeekdays.map((d) => dayNames[d]).join(', ') });
    }
    if (!visibleFromInput && !visibleUntilInput) return t('summary.pickWindow');
    const from = visibleFromInput ? new Date(visibleFromInput).toLocaleString(`${locale}-IN`) : tl('now');
    const until = visibleUntilInput ? new Date(visibleUntilInput).toLocaleString(`${locale}-IN`) : tl('noEnd');
    return t('summary.range', { from, until });
  };

  /**
   * What the price actually means, in one sentence under the group — including the two cases the old three-cell
   * panel left the owner to work out: no saving at all, and a package priced ABOVE what its parts come to.
   */
  const priceFootnote = (): string => {
    if (selectedServices.length === 0) return t('price.needServices');
    if (comboPriceMinor == null) return t('price.setCost');
    // The one case the three rows read wrong on their own: a package dearer than its parts shows "You save —".
    if (savingsMinor != null && savingsMinor < 0) return t('price.above', { amount: formatMoney(String(-savingsMinor)) });
    if (savingsMinor === 0) return t('price.noSaving');
    return '';
  };

  /** Mandatory-field checks — each error renders inline next to its own field, not as a banner up top. */
  const validateForm = (): boolean => {
    const errs: typeof fieldErrors = {};
    if (!title.trim()) errs.title = t('errors.nameRequired');
    if (selectedIds.length === 0) errs.services = t('errors.addOne');
    /*
     * Jira GRW-473 — a package needs a price. "Fixed price" opens with an empty box, and Publish checked only the
     * name: the package saved with no price, which the API stores as NULL — and NULL is what makes an offer an
     * announcement, so the package turned up in Offers instead.
     */
    if (selectedIds.length > 0 && comboPriceMinor == null) errs.price = t('errors.priceRequired');
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async (publish: boolean) => {
    if (!validateForm()) return;
    /*
     * Jira GRW-473 — two ways to save a package that would never show. "Only on" with no day ticked is visible on
     * no day at all, and a window whose end is before its start contains no moment. Both live behind the folded
     * row, so the row opens on the way to saying so.
     */
    if (visibilityMode === 'weekdays' && visibleWeekdays.length === 0) {
      setError(t('errors.pickADay'));
      setWhenOpen(true);
      return;
    }
    if (visibilityMode === 'window') {
      const from = fromDatetimeLocal(visibleFromInput);
      const until = fromDatetimeLocal(visibleUntilInput);
      if (from && until && Date.parse(from) >= Date.parse(until)) {
        setError(t('errors.windowBackwards'));
        setWhenOpen(true);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<OfferInput> = {
        title: title.trim(),
        description: description.trim() || null,
        active: publish,
        serviceIds: selectedIds,
        comboPriceMinor,
        visibleWeekdays: visibilityMode === 'weekdays' ? visibleWeekdays : null,
        visibleFrom: visibilityMode === 'window' ? fromDatetimeLocal(visibleFromInput) : null,
        visibleUntil: visibilityMode === 'window' ? fromDatetimeLocal(visibleUntilInput) : null,
      };
      if (mode === 'create') {
        const created = await api.createOffer({
          ...(payload as OfferInput),
          ...(atBranch ? { locationId: atBranch } : {}),
          ...(allBranches ? { allBranches: true } : {}),
        });
        // Jira GRW-381 (FR-03) — "all branches" says where it went, and which branches were skipped and why.
        if (allBranches) {
          setPublished(created);
          return;
        }
      } else {
        await api.updateOffer(initialOffer!.id, payload);
      }
      leave();
    } catch (err) {
      // Jira GRW-473 — the server's reason when it gave one ("a service from another branch"), not a guess.
      setError(err instanceof ApiError && err.status < 500 ? err.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Jira GRW-435 — asked in the app's own dialog, and refused in the API's own words.
   *
   * The generic `errors.deleteFailed` ("check the server is running") was actively misleading here: the usual
   * reason a combo will not delete is that somebody is waiting for it right now (GRW-434), which is about the
   * salon, not the server. The owner was sent to look at infrastructure over a client in a chair.
   */
  const deleteCombo = async () => {
    if (!initialOffer) return;
    setBusy(true);
    setDeleteError(null);
    // A failed save left its own message on the page behind this dialog, and only `save()` ever cleared it —
    // so a refused delete showed the owner two unrelated errors at once. The delete owns the screen now.
    setError(null);
    try {
      await api.deleteOffer(initialOffer.id);
      setConfirmDelete(false);
      leave();
    } catch (err) {
      // `send()` raises every 409 as BookingConflictError, not ApiError — see the note in OffersList.doRemove.
      const refused = err instanceof BookingConflictError || (err instanceof ApiError && err.status < 500);
      setDeleteError(refused && err instanceof Error && err.message ? err.message : t('errors.deleteFailed'));
      setBusy(false);
    }
  };

  if (published) {
    const here = branchContext.branches.find((b) => b.id === published.locationId)?.name ?? '';
    const went = [{ name: here, locationId: published.locationId ?? '' }, ...(published.published ?? [])].filter((b) => b.name);
    return (
      <div className="card offer-published" role="status">
        <div className="card-body">
          <h2 className="wizard-section-title">{tb('resultTitle', { title: published.title })}</h2>
          <p>{tb('resultPublished', { branches: went.map((b) => b.name).join(', ') })}</p>
          {(published.skipped ?? []).map((s) => (
            <p key={s.locationId} className="field-hint">
              {tb('resultSkipped', { branch: s.name, missing: s.missing.join(', ') })}
            </p>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => {
              leave();
            }}
          >
            {tb('done')}
          </button>
        </div>
      </div>
    );
  }

  const previewCard = (
    <PreviewCard
      title={title}
      services={selectedServices}
      description={description}
      originalPriceMinor={originalPriceMinor}
      comboPriceMinor={comboPriceMinor}
      savingsMinor={savingsMinor}
      savingsPct={savingsPct}
      visibilitySummary={visibilitySummary()}
    />
  );

  return (
    <div className="pkg-editor">
      {/* Back · what this screen is · Save. Nothing else competes for the top of a 344px screen. */}
      <div className="pe-head">
        <button type="button" className="pe-back" aria-label={t('backAria')} onClick={leave}>
          <span aria-hidden="true">←</span>
        </button>
        <h1 className="pe-title">{mode === 'create' ? t('createTitle') : t('editTitle', { title: initialOffer!.title })}</h1>
        <button type="button" className="btn pe-save" disabled={busy} onClick={() => save(true)}>
          {busy ? t('saving') : t('publish')}
        </button>
      </div>

      {error && (
        <div className="banner" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="pe-layout">
        <div className="pe-form">
          <div className="sheet-label sheet-label-details">{t('groups.details')}</div>
          <div className="sheet-group">
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor="pkg-name">
                {t('packageName')}
              </label>
              <div className="sheet-row-value">
                <input
                  id="pkg-name"
                  type="text"
                  value={title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (fieldErrors.title && e.target.value.trim()) setFieldErrors((er) => ({ ...er, title: undefined }));
                  }}
                  placeholder={t('namePlaceholder')}
                  className={fieldErrors.title ? 'field-invalid' : undefined}
                />
              </div>
            </div>
            {taglineOpen ? (
              <div className="sheet-row">
                <label className="sheet-row-label" htmlFor="pkg-tagline">
                  {t('tagline')}
                </label>
                <div className="sheet-row-value">
                  <input
                    id="pkg-tagline"
                    type="text"
                    value={description}
                    maxLength={TAGLINE_MAX}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('taglinePlaceholder')}
                  />
                </div>
              </div>
            ) : (
              <button type="button" className="pe-add-row" onClick={() => setTaglineOpen(true)}>
                {t('addTagline')}
              </button>
            )}
          </div>
          {fieldErrors.title && (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {fieldErrors.title}
            </div>
          )}

          {mode === 'create' ? (
            <OfferBranchField
              value={atBranch}
              onChange={(id) => {
                // Another branch's menu: what was picked here is not on it.
                setPickedBranch(id);
                setSelectedIds([]);
              }}
              allBranches={allBranches}
              onAllBranches={setAllBranches}
              disabled={busy}
            />
          ) : null}

          <div className="sheet-label pe-label-services">{t('groups.services')}</div>
          <div className="sheet-group">
            {/* At the top of the group, not under the list: with eight services in it, the way to add a ninth
                was a scroll away, and it is the one control on this group an owner comes back for. */}
            <button type="button" className="pe-add-row" onClick={() => setPickerOpen(true)}>
              {t('picker.open')}
            </button>
            {/* Eight rows show in full; a ninth and beyond scroll inside the group, so Add services and everything under it stay in reach. */}
            <div className={`pe-service-list ${selectedServices.length > 8 ? 'is-long' : ''}`}>
            {selectedServices.map((s, i) => (
              <div key={s.id} className="sheet-row pe-service-row">
                <div className="picked-row-order">
                  <button type="button" disabled={i === 0} onClick={() => moveService(i, -1)} aria-label={t('moveUp')}>
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={i === selectedServices.length - 1}
                    onClick={() => moveService(i, 1)}
                    aria-label={t('moveDown')}
                  >
                    ▼
                  </button>
                </div>
                { }
                <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={36} height={36} />
                <div className="picked-row-main">
                  <div className="picker-row-name">{s.name}</div>
                  <div className="picker-row-meta">{tm('minutes', { count: s.durationMin })}</div>
                </div>
                <span className="picked-row-price">{formatMoney(s.priceMinor)}</span>
                <button type="button" className="pkg-remove" aria-label={`${s.name} ✕`} onClick={() => removeService(s.id)}>
                  ✕
                </button>
              </div>
            ))}
            </div>
          </div>
          <div role={fieldErrors.services ? 'alert' : undefined} className={`sheet-foot pe-foot-services ${fieldErrors.services ? 'sheet-foot-error' : ''}`}>
            {/* The time it all takes is nowhere else on this page now, and it is what an owner books against. */}
            {fieldErrors.services ??
              (selectedServices.length === 0
                ? t('servicesEmpty')
                : t('servicesSummary', {
                    count: selectedServices.length,
                    duration: durationPhrase(
                      selectedServices.reduce((sum, s) => sum + s.durationMin, 0),
                      {
                        minutes: (c) => tm('minutes', { count: c }),
                        hours: (c) => tm('hours', { count: c }),
                        hoursMinutes: (h, m) => tm('hoursMinutes', { hours: h, minutes: m }),
                      },
                    ),
                  }))}
          </div>

          <div className="sheet-label sheet-label-price">{t('groups.price')}</div>
          {/*
            The panel the design draws: each figure under its own label, the three ways to price it as one
            segmented control, and the amount in a field of its own. It went to single rows on the way to fitting
            a phone and lost the shape; the shape is what makes the three numbers read as one sum.
          */}
          <div className="pe-price-card">
            <div className="pe-price-field">
              <span className="pe-price-label">{t('original')}</span>
              <div className="pe-price-figure">{formatMoney(String(originalPriceMinor))}</div>
            </div>

            <div className="pe-price-field">
              <span className="pe-price-label" id="pkg-price-label">
                {t('packagePrice')}
              </span>
              {/*
                Jira GRW-438 — three ways to price it, and "Sum of parts" is a real choice rather than the absence
                of one. All three visible, because which one is NOT in force is half of what the control says.
              */}
              <div className="pe-mode-toggle" role="group" aria-labelledby="pkg-price-label">
                {(['flat', 'percent', 'sum'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={priceMode === m ? 'is-on' : ''}
                    aria-pressed={priceMode === m}
                    onClick={() => switchPriceMode(m)}
                  >
                    {t(m === 'flat' ? 'flat' : m === 'percent' ? 'percent' : 'sumOfParts')}
                  </button>
                ))}
              </div>
              {priceMode === 'flat' && (
                <input
                  className={`pe-price-input ${fieldErrors.price ? 'field-invalid' : ''}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={flatInput}
                  onChange={(e) => setFlatInput(e.target.value)}
                  placeholder="0"
                  aria-label={t('packagePrice')}
                />
              )}
              {priceMode === 'percent' && (
                <input
                  className={`pe-price-input ${fieldErrors.price ? 'field-invalid' : ''}`}
                  type="number"
                  min="0"
                  max="100"
                  inputMode="numeric"
                  value={percentInput}
                  onChange={(e) => setPercentInput(e.target.value)}
                  onBlur={(e) => setPercentInput(clampPercentInput(e.target.value))}
                  placeholder="0"
                  aria-label={t('percent')}
                />
              )}
              {/* "Sum of parts" sets no number of its own — it IS the total above, so the field says so. */}
              {priceMode === 'sum' && <div className="pe-price-figure">{formatMoney(String(originalPriceMinor))}</div>}
            </div>

            <div className="pe-price-field">
              <span className="pe-price-label">{t('youSave')}</span>
              <div className={`pe-price-figure ${savingsMinor != null && savingsMinor > 0 ? 'is-saving' : ''}`}>
                {savingsMinor != null && savingsMinor > 0
                  ? `${formatMoney(String(savingsMinor))} (${savingsPct}%)`
                  : t('price.nothing')}
              </div>
            </div>
          </div>

          {/* What the client ends up paying, said in words, the way the design has it under the panel. */}
          {fieldErrors.price ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {fieldErrors.price}
            </div>
          ) : savingsMinor != null && savingsMinor > 0 ? (
            <div className="savings-banner">
              {t('customersPay', {
                price: formatMoney(String(comboPriceMinor!)),
                original: formatMoney(String(originalPriceMinor)),
              })}
            </div>
          ) : (
            priceFootnote() && <div className="sheet-foot">{priceFootnote()}</div>
          )}

          {/* When it runs: one row that states its own answer, and opens on the choices behind it. */}
          <div className="sheet-label pe-label-when">{t('groups.when')}</div>
          <div className="sheet-group">
            <button
              type="button"
              className="sheet-row pe-disclosure"
              aria-expanded={whenOpen}
              onClick={() => setWhenOpen((o) => !o)}
            >
              <span className="sheet-row-label">{t('whenItRuns')}</span>
              <span className="sheet-row-value pe-disclosure-value">
                {visibilitySummary()}
                <span className="pe-chevron" aria-hidden="true" />
              </span>
            </button>
            {whenOpen && (
              <div className="pe-when">
                {(['always', 'weekdays', 'window'] as const).map((opt) => (
                  <div key={opt}>
                    <label className="rules-option">
                      <input
                        type="radio"
                        name="visibility"
                        checked={visibilityMode === opt}
                        onChange={() => setVisibilityMode(opt)}
                      />
                      <div className="rules-option-body">
                        <div className="rules-option-title">{t(`visibility.${opt}.title`)}</div>
                        <div className="rules-option-sub">{t(`visibility.${opt}.sub`)}</div>
                      </div>
                    </label>
                    {opt === 'weekdays' && visibilityMode === 'weekdays' && (
                      <div className="weekday-picker">
                        {dayNames.map((name, i) => (
                          <button
                            key={name}
                            type="button"
                            className={`weekday-chip ${visibleWeekdays.includes(i) ? 'active' : ''}`}
                            onClick={() => toggleWeekday(i)}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                    {opt === 'window' && visibilityMode === 'window' && (
                      <div className="date-window">
                        <div className="field">
                          <label htmlFor="pkg-from">{t('from')}</label>
                          <input
                            id="pkg-from"
                            type="datetime-local"
                            value={visibleFromInput}
                            onChange={(e) => setVisibleFromInput(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="pkg-until">{t('until')}</label>
                          <input
                            id="pkg-until"
                            type="datetime-local"
                            value={visibleUntilInput}
                            onChange={(e) => setVisibleUntilInput(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* The two secondary ways out, below the form rather than competing with Save at the top. */}
          <div className="pe-secondary">
            <button type="button" className="btn btn-ghost pe-preview-btn" onClick={() => setPreviewOpen(true)}>
              {t('sidebarPreview')}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
              {t('saveDraft')}
            </button>
          </div>

          {mode === 'edit' && (
            <div className="sheet-group sheet-group-danger">
              <button
                type="button"
                className="sheet-danger-row sheet-danger-delete"
                disabled={busy}
                onClick={() => {
                  setDeleteError(null);
                  setConfirmDelete(true);
                }}
              >
                {t('deleteRow')}
              </button>
            </div>
          )}
        </div>

        {/* A laptop has the room to keep the client's view on screen the whole time; a phone opens it. */}
        <aside className="pe-aside">
          <div className="card">
            <div className="card-head">
              <span>{t('sidebarPreview')}</span>
            </div>
            <div className="card-body">
              {selectedServices.length === 0 ? (
                <div className="empty">{t('sidebarEmpty')}</div>
              ) : (
                <>
                  {previewCard}
                  <div className="preview-caption">{t('caption')}</div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {pickerOpen && (
        <ServicePickerSheet
          services={services}
          selectedIds={selectedIds}
          branchId={atBranch}
          onToggle={toggleService}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {previewOpen && (
        <PreviewSheet onClose={() => setPreviewOpen(false)}>
          {selectedServices.length === 0 ? <div className="empty">{t('sidebarEmpty')}</div> : previewCard}
        </PreviewSheet>
      )}

      {confirmDelete && initialOffer && (
        <ConfirmDialog
          title={tl('deleteTitle', { title: initialOffer.title })}
          body={tl('deleteBody')}
          detail={initialOffer.comboPriceMinor != null ? tl('deleteDetail') : undefined}
          confirmLabel={t('delete')}
          tone="danger"
          busy={busy}
          error={deleteError}
          onConfirm={deleteCombo}
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
