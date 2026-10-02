'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
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
import { OfferBranchField, useDefaultOfferBranch } from '../offers/OfferBranchField';
import { useBranch } from '../components/BranchProvider';
import { matchItems, MIN_CHARS } from '../lib/service-match';
import { servicePhotoUrl } from '../lib/service-photos';
import { weekdayNames } from '../lib/weekday-names';
import { pricedMinor, type PriceMode } from './packages-logic';

/**
 * Build → Rules → Preview wizard for creating/editing a combo offer. One
 * component handles both create and edit (`initialOffer` present only for
 * edit) — the API payload shape is identical either way.
 */

/** Each step is named in `packages.builder.steps`; `nav` is the label on the button that leads to the NEXT step. */
const STEPS = [
  { key: 1, name: 'build', hasNav: true },
  { key: 2, name: 'rules', hasNav: true },
  { key: 3, name: 'preview', hasNav: false },
] as const;

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
  showLiveIndicator,
}: {
  title: string;
  services: Service[];
  description: string;
  originalPriceMinor: number;
  comboPriceMinor: number | null;
  savingsMinor: number | null;
  savingsPct: number | null;
  visibilitySummary: string;
  /** Only the Step 3 preview shows the 🟢/⚪ visible-right-now indicator — the sidebar preview stays neutral since it's always on screen, not something the admin is checking "right now" for. */
  showLiveIndicator?: { isVisibleNow: boolean };
}) {
  const t = useTranslations('packages.builder');
  const tm = useTranslations('services');
  const totalMin = services.reduce((sum, s) => sum + s.durationMin, 0);
  const formatDuration = (min: number): string => {
    if (min < 60) return tm('minutes', { count: min });
    const hours = min / 60;
    return t('card.hours', { hours: hours % 1 === 0 ? hours : hours.toFixed(1) });
  };
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
          {comboPriceMinor != null && <span className="preview-price-original">{formatMoney(String(originalPriceMinor))}</span>}
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
            <span>📅</span>
            {showLiveIndicator ? (showLiveIndicator.isVisibleNow ? '🟢 ' : '⚪ ') : ''}
            {visibilitySummary}
          </div>
          {totalMin > 0 && (
            <div className="preview-fact">
              <span>⏱️</span>{t('card.takes', { duration: formatDuration(totalMin) })}
            </div>
          )}
          <div className="preview-fact">
            <span>👤</span>{t('card.byAnyStaff')}
          </div>
        </div>
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

  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Publishing needs a real look at Preview first — the step tabs only let
  // you jump BACK to an already-visited step (to edit something), never
  // ahead, so there's no way to skip straight to Publish from Build.
  const [maxStepReached, setMaxStepReached] = useState<1 | 2 | 3>(1);
  // Pure display toggle for the preview card — same data either way, just
  // how wide/framed it renders, matching the phone customers actually see
  // this on vs. the dashboard the admin is looking at right now.
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [title, setTitle] = useState(initialOffer?.title ?? '');
  const [description, setDescription] = useState(initialOffer?.description ?? '');
  const [search, setSearch] = useState('');
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
    initialOffer?.comboPriceMinor && initialOriginal > 0
      ? String(Math.round((1 - Number(initialOffer.comboPriceMinor) / initialOriginal) * 100))
      : '',
  );

  const [visibilityMode, setVisibilityMode] = useState<VisibilityMode>(
    initialOffer?.visibleWeekdays ? 'weekdays' : initialOffer?.visibleFrom || initialOffer?.visibleUntil ? 'window' : 'always',
  );
  const [visibleWeekdays, setVisibleWeekdays] = useState<number[]>(initialOffer?.visibleWeekdays ?? []);
  const [visibleFromInput, setVisibleFromInput] = useState(toDatetimeLocal(initialOffer?.visibleFrom ?? null));
  const [visibleUntilInput, setVisibleUntilInput] = useState(toDatetimeLocal(initialOffer?.visibleUntil ?? null));

  const [busy, setBusy] = useState(false);
  // Submission failures only (network/server) — field-level required-ness
  // shows inline next to the field itself, not as a banner up top.
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; services?: string }>({});

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
      setPercentInput(String(Math.round((1 - comboPriceMinor / originalPriceMinor) * 100)));
    } else if (next === 'flat' && comboPriceMinor != null) {
      setFlatInput(String(comboPriceMinor / 100));
    }
    setPriceMode(next);
  };

  // Jira GRW-375 — same matching as the walk-in sheet and the services table.
  const unpicked = services.filter((s) => !selectedIds.includes(s.id));
  const filteredServices =
    search.trim().length < MIN_CHARS
      ? unpicked
      : matchItems(
          unpicked.map((s) => ({ item: s, text: [s.name] })),
          search,
        );

  const addService = (id: string) => {
    setSelectedIds((ids) => [...ids, id]);
    // Clears the box and closes the results list — picking a service is a
    // completed action, not something that should leave a stale query (and
    // a "No matching services" dead end) sitting open behind it. Typing
    // again starts a fresh search the same way.
    setSearch('');
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

  const isVisibleNow = (): boolean => {
    const now = new Date();
    if (visibilityMode === 'weekdays') return visibleWeekdays.includes(now.getDay());
    if (visibilityMode === 'window') {
      const from = fromDatetimeLocal(visibleFromInput);
      const until = fromDatetimeLocal(visibleUntilInput);
      if (from && now < new Date(from)) return false;
      if (until && now > new Date(until)) return false;
      return true;
    }
    return true;
  };

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

  /** Step tabs: only lets you jump back to an already-visited step — never ahead. */
  const goToStep = (target: 1 | 2 | 3) => {
    if (target <= maxStepReached) setStep(target);
  };

  /** Mandatory-field checks for the Build step — each error renders inline next to its own field, not as a top banner. */
  const validateBuildStep = (): boolean => {
    const errs: typeof fieldErrors = {};
    if (!title.trim()) errs.title = t('errors.nameRequired');
    if (selectedIds.length === 0) errs.services = t('errors.addOne');
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (step === 1 && !validateBuildStep()) return;
    const next = ((step + 1) as 1 | 2 | 3);
    setStep(next);
    setMaxStepReached((m) => (next > m ? next : m));
  };

  const goBack = () => setStep((s) => ((s - 1) as 1 | 2 | 3));

  const save = async (publish: boolean) => {
    if (!validateBuildStep()) {
      setStep(1);
      return;
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
      router.push('/packages');
      router.refresh();
    } catch {
      setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Edit mode only — there's otherwise no way to delete a combo from inside
   * the builder itself, and the per-service ✕ buttons in the picked list
   * (which only remove one service each) are easy to mistake for it.
   */
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
    // A failed save left its own message on the wizard behind this dialog, and only `save()` ever cleared it —
    // so a refused delete showed the owner two unrelated errors at once. The delete owns the screen now.
    setError(null);
    try {
      await api.deleteOffer(initialOffer.id);
      setConfirmDelete(false);
      router.push('/packages');
      router.refresh();
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
              router.push('/packages');
              router.refresh();
            }}
          >
            {tb('done')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="wizard-head">
        <div className="wizard-title">
          <button className="btn btn-ghost" onClick={() => router.push('/packages')}>
            {t('back')}
          </button>
          <div>
            <h1>{mode === 'create' ? t('createTitle') : t('editTitle', { title: initialOffer!.title })}</h1>
            <p className="wizard-subtitle">{t('subtitle')}</p>
          </div>
        </div>
        <div className="wizard-actions">
          {mode === 'edit' && (
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
            >
              {t('delete')}
            </button>
          )}
          <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
            <span className="wizard-nav-label-full">{t('saveDraft')}</span>
            <span className="wizard-nav-label-short">{t('draftShort')}</span>
          </button>
          {step < 3 ? (
            <button className="btn" onClick={goNext}>
              <span className="wizard-nav-label-full">
                {t('nextFull', { label: t(`steps.${STEPS[step - 1]!.name}.nav` as 'steps.build.nav') })}
              </span>
              <span className="wizard-nav-label-short">{t('nextShort')}</span>
            </button>
          ) : (
            <button className="btn" disabled={busy || !title.trim()} onClick={() => save(true)}>
              {busy ? t('saving') : t('publish')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="banner" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="wizard-rail">
        <div className="wizard-steps">
          {STEPS.map((s) => (
            <button
              key={s.key}
              className={`wizard-step ${step === s.key ? 'wizard-step-active' : ''} ${s.key > maxStepReached ? 'wizard-step-locked' : ''}`}
              disabled={s.key > maxStepReached}
              onClick={() => goToStep(s.key)}
            >
              <span className="wizard-step-num">{s.key}</span>
              <span>
                <div className="wizard-step-title">{t(`steps.${s.name}.title`)}</div>
                <div className="wizard-step-sub">{t(`steps.${s.name}.sub`)}</div>
              </span>
            </button>
          ))}
        </div>

        <div className="wizard-tip wizard-tip-rail">
          <span>💡</span>
          <div>
            <strong>{t('tip')}</strong>
            {/* GRW-165 — future tense, deliberately. Nothing sends or receives a
                WhatsApp message yet, and a builder that says otherwise is
                selling the owner a feature they have not got. */}
            <div>{t('tipBody')}</div>
          </div>
        </div>
      </div>

      <div className="wizard-layout">
        <div className="card">
          <div className="card-body" style={{ paddingTop: 18 }}>
            {step === 1 && (
              <>
                <div className="wizard-section-title">{t('packageDetails')}</div>
                <div className="grid-2">
                  <div className="field">
                    <label>
                      <span>{t('packageName')}</span>
                      <span className="field-counter">
                        {title.length}/{TITLE_MAX}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      maxLength={TITLE_MAX}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (fieldErrors.title && e.target.value.trim()) setFieldErrors((er) => ({ ...er, title: undefined }));
                      }}
                      placeholder={t('namePlaceholder')}
                      className={fieldErrors.title ? 'field-invalid' : undefined}
                      style={{ width: '100%' }}
                    />
                    {fieldErrors.title && <div role="alert" className="field-error">{fieldErrors.title}</div>}
                  </div>
                  <div className="field">
                    <label>
                      <span>{t('tagline')}</span>
                      <span className="field-counter">
                        {description.length}/{TAGLINE_MAX}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={description}
                      maxLength={TAGLINE_MAX}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t('taglinePlaceholder')}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

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

                <div className="wizard-section-title" style={{ marginTop: 22 }}>
                  {t('addServices')}
                </div>
                <p className="muted" style={{ marginTop: -8, marginBottom: 12, fontSize: 13.5 }}>
                  {t('addServicesHint')}
                </p>
                <div className="picker-search" style={{ marginTop: 8 }}>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('searchServices', { count: services.length })}
                    className={fieldErrors.services ? 'field-invalid' : undefined}
                    style={{ width: '100%', paddingRight: search ? 36 : undefined }}
                  />
                  {search !== '' && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearch('')}
                      aria-label={t('clearSearch')}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {fieldErrors.services && <div role="alert" className="field-error">{fieldErrors.services}</div>}
                {search.trim() !== '' && (
                  <div className="picker-results">
                    {filteredServices.length === 0 ? (
                      <div className="picker-row" style={{ cursor: 'default' }}>
                        <span className="muted">{t('noMatch')}</span>
                      </div>
                    ) : (
                      filteredServices.slice(0, 20).map((s) => (
                        <div key={s.id} className="picker-row" onClick={() => addService(s.id)}>
                          { }
                          <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={36} height={36} />
                          <div style={{ flex: 1 }}>
                            <div className="picker-row-name">{s.name}</div>
                            <div className="picker-row-meta">{tm('minutes', { count: s.durationMin })}</div>
                          </div>
                          <span className="picker-row-price">{formatMoney(s.priceMinor)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div className="picked-list">
                  {selectedServices.length === 0 ? (
                    <div className="empty">{t('pickHint')}</div>
                  ) : (
                    selectedServices.map((s, i) => (
                      <div key={s.id} className="picked-row">
                        <div className="picked-row-order">
                          <button disabled={i === 0} onClick={() => moveService(i, -1)} aria-label={t('moveUp')}>
                            ▲
                          </button>
                          <button
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
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => removeService(s.id)}>
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="wizard-section-title" style={{ marginTop: 22 }}>
                  {t('pricing')}
                </div>
                <div className="price-panel">
                  <div className="price-panel-cell">
                    <label>{t('original')}</label>
                    <div className="price-panel-value">{formatMoney(String(originalPriceMinor))}</div>
                  </div>
                  <div className="price-panel-cell">
                    <label>{t('packagePrice')}</label>
                    <div className="price-mode-toggle">
                      <button className={priceMode === 'flat' ? 'active' : ''} onClick={() => switchPriceMode('flat')}>
                        {t('flat')}
                      </button>
                      <button className={priceMode === 'percent' ? 'active' : ''} onClick={() => switchPriceMode('percent')}>
                        {t('percent')}
                      </button>
                      {/*
                        Jira GRW-438 — the third mode, and a real choice rather than the absence of one:
                        "charge what the parts cost, show no discount". Stored as a price equal to the parts
                        total, never as no price at all — a package with no price is an announcement.
                      */}
                      <button className={priceMode === 'sum' ? 'active' : ''} onClick={() => switchPriceMode('sum')}>
                        {t('sumOfParts')}
                      </button>
                    </div>
                    {priceMode === 'flat' && (
                      <input
                        type="number"
                        min="0"
                        value={flatInput}
                        onChange={(e) => setFlatInput(e.target.value)}
                        placeholder="0"
                        style={{ width: '100%' }}
                      />
                    )}
                    {priceMode === 'percent' && (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={percentInput}
                        onChange={(e) => setPercentInput(e.target.value)}
                        placeholder="0"
                        style={{ width: '100%' }}
                      />
                    )}
                    {priceMode === 'sum' && <div className="price-panel-note">{t('sumOfPartsNote')}</div>}
                  </div>
                  <div className="price-panel-cell">
                    <label>{t('youSave')}</label>
                    <div className="price-panel-value" style={{ color: 'var(--accent-deep)' }}>
                      {savingsMinor != null && savingsMinor >= 0
                        ? `${formatMoney(String(savingsMinor))} (${savingsPct}%)`
                        : '—'}
                    </div>
                  </div>
                </div>
                {comboPriceMinor != null &&
                  (savingsMinor != null && savingsMinor > 0 ? (
                    <div className="savings-banner">
                      {t('customersPay', { price: formatMoney(String(comboPriceMinor)), original: formatMoney(String(originalPriceMinor)) })}
                    </div>
                  ) : (
                    /* Said plainly rather than left blank: "no saving" is a decision the owner should see they made. */
                    <div className="savings-banner savings-banner-none">{t('noSavingShown')}</div>
                  ))}
              </>
            )}

            {step === 2 && (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {t('rulesIntro')}
                </p>
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
                          <label>{t('from')}</label>
                          <input
                            type="datetime-local"
                            value={visibleFromInput}
                            onChange={(e) => setVisibleFromInput(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>{t('until')}</label>
                          <input
                            type="datetime-local"
                            value={visibleUntilInput}
                            onChange={(e) => setVisibleUntilInput(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {step === 3 && (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {t('previewIntro')}
                </p>
                {selectedServices.length === 0 ? (
                  <div className="empty">{t('previewEmpty')}</div>
                ) : (
                  <div className="preview-facts" style={{ borderTop: 'none', paddingTop: 0, marginTop: 4 }}>
                    <div className="preview-fact">
                      <span>🎁</span>
                      {title || t('untitled')}
                    </div>
                    <div className="preview-fact">
                      <span>🧾</span>
                      {t('servicesCount', { count: selectedServices.length })} ·{' '}
                      {formatMoney(String(comboPriceMinor ?? originalPriceMinor))}
                    </div>
                    <div className="preview-fact">
                      <span>{isVisibleNow() ? '🟢' : '⚪'}</span>
                      {visibilitySummary()}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Forward progress (Next/Publish) and Save-as-draft live in the top bar, always in view —
                this row is just the way back down here for editing something after scrolling. */}
            {step > 1 && (
              <div className="wizard-nav">
                <button className="btn btn-ghost" onClick={goBack}>
                  {t('back')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="wizard-sidebar">
        <div className="card">
          <div className="card-head">
            <span>{t('sidebarPreview')}</span>
            <div className="device-toggle">
              <button
                className={previewDevice === 'mobile' ? 'active' : ''}
                aria-label={t('mobileAria')}
                onClick={() => setPreviewDevice('mobile')}
              >
                📱
              </button>
              <button
                className={previewDevice === 'desktop' ? 'active' : ''}
                aria-label={t('desktopAria')}
                onClick={() => setPreviewDevice('desktop')}
              >
                🖥️
              </button>
            </div>
          </div>
          <div className="card-body">
            {selectedServices.length === 0 ? (
              <div className="empty">{t('sidebarEmpty')}</div>
            ) : (
              <div className={`device-frame device-frame-${previewDevice}`}>
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
                <div className="preview-caption">{t('caption')}</div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

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
