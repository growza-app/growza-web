'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, formatMoney, type Offer, type OfferInput, type Service } from '../lib/api';
import { servicePhotoUrl } from '../lib/service-photos';

/**
 * Build → Rules → Preview wizard for creating/editing a combo offer. One
 * component handles both create and edit (`initialOffer` present only for
 * edit) — the API payload shape is identical either way.
 */

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDuration(totalMin: number): string {
  if (totalMin < 60) return `${totalMin} min`;
  const hours = totalMin / 60;
  return `~${hours % 1 === 0 ? hours : hours.toFixed(1)} hrs`;
}
const STEPS = [
  { key: 1, title: 'Build', sub: 'Add services & pricing', navLabel: 'Rules & availability' },
  { key: 2, title: 'Rules', sub: 'Set visibility & limits', navLabel: 'Preview' },
  { key: 3, title: 'Preview', sub: 'See how customers see it', navLabel: null },
] as const;

const TITLE_MAX = 60;
const TAGLINE_MAX = 80;

type VisibilityMode = 'always' | 'weekdays' | 'window';
type PriceMode = 'flat' | 'percent';

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
  const totalMin = services.reduce((sum, s) => sum + s.durationMin, 0);
  return (
    <div className="preview-card">
      <div className="preview-body">
        <span className="preview-badge">COMBO</span>
        <div className="preview-title">{title || 'Untitled combo'}</div>
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
          {savingsPct != null && savingsPct > 0 && <span className="chip chip-confirmed">{savingsPct}% OFF</span>}
        </div>
        {savingsMinor != null && savingsMinor > 0 && (
          <div className="savings-banner" style={{ marginTop: 10 }}>
            You save {formatMoney(String(savingsMinor))}
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
              <span>⏱️</span>Takes {formatDuration(totalMin)}
            </div>
          )}
          <div className="preview-fact">
            <span>👤</span>By any available staff
          </div>
        </div>
      </div>
    </div>
  );
}

export function ComboBuilder({ services, initialOffer }: { services: Service[]; initialOffer?: Offer }) {
  const router = useRouter();
  const mode = initialOffer ? 'edit' : 'create';

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
  const [priceMode, setPriceMode] = useState<PriceMode>('flat');
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

  const comboPriceMinor =
    priceMode === 'flat'
      ? flatInput.trim() === '' || !Number.isFinite(Number(flatInput))
        ? null
        : Math.round(Number(flatInput) * 100)
      : percentInput.trim() === '' || !Number.isFinite(Number(percentInput))
        ? null
        : Math.round(originalPriceMinor * (1 - Number(percentInput) / 100));

  const savingsMinor = comboPriceMinor != null ? originalPriceMinor - comboPriceMinor : null;
  const savingsPct =
    savingsMinor != null && originalPriceMinor > 0 ? Math.round((savingsMinor / originalPriceMinor) * 100) : null;

  const switchPriceMode = (next: PriceMode) => {
    if (next === priceMode) return;
    if (next === 'percent' && comboPriceMinor != null && originalPriceMinor > 0) {
      setPercentInput(String(Math.round((1 - comboPriceMinor / originalPriceMinor) * 100)));
    } else if (next === 'flat' && comboPriceMinor != null) {
      setFlatInput(String(comboPriceMinor / 100));
    }
    setPriceMode(next);
  };

  const filteredServices = services.filter(
    (s) => !selectedIds.includes(s.id) && s.name.toLowerCase().includes(search.trim().toLowerCase()),
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
    if (visibilityMode === 'always') return 'Always visible to customers';
    if (visibilityMode === 'weekdays') {
      if (visibleWeekdays.length === 0) return 'Pick at least one day';
      return `Only on: ${visibleWeekdays.map((d) => WEEKDAY_NAMES[d]).join(', ')}`;
    }
    if (!visibleFromInput && !visibleUntilInput) return 'Pick a start and/or end date';
    const from = visibleFromInput ? new Date(visibleFromInput).toLocaleString('en-IN') : 'now';
    const until = visibleUntilInput ? new Date(visibleUntilInput).toLocaleString('en-IN') : 'no end date';
    return `From ${from} to ${until}`;
  };

  /** Step tabs: only lets you jump back to an already-visited step — never ahead. */
  const goToStep = (target: 1 | 2 | 3) => {
    if (target <= maxStepReached) setStep(target);
  };

  /** Mandatory-field checks for the Build step — each error renders inline next to its own field, not as a top banner. */
  const validateBuildStep = (): boolean => {
    const errs: typeof fieldErrors = {};
    if (!title.trim()) errs.title = 'Combo name is required';
    if (selectedIds.length === 0) errs.services = 'Add at least one service';
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
        await api.createOffer(payload as OfferInput);
      } else {
        await api.updateOffer(initialOffer!.id, payload);
      }
      router.push('/offers');
      router.refresh();
    } catch {
      setError('Could not save — check the server is running.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Edit mode only — there's otherwise no way to delete a combo from inside
   * the builder itself, and the per-service ✕ buttons in the picked list
   * (which only remove one service each) are easy to mistake for it.
   */
  const deleteCombo = async () => {
    if (!initialOffer) return;
    if (!window.confirm(`Delete "${initialOffer.title}"? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteOffer(initialOffer.id);
      router.push('/offers');
      router.refresh();
    } catch {
      setError('Could not delete — check the server is running.');
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="wizard-head">
        <div className="wizard-title">
          <button className="btn btn-ghost" onClick={() => router.push('/offers')}>
            ← Back
          </button>
          <div>
            <h1>{mode === 'create' ? 'Create a new combo' : `Edit ${initialOffer!.title}`}</h1>
            <p className="wizard-subtitle">Build a combo of services and give your customers a special price.</p>
          </div>
        </div>
        <div className="wizard-actions">
          {mode === 'edit' && (
            <button className="btn btn-danger" disabled={busy} onClick={deleteCombo}>
              Delete
            </button>
          )}
          <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>
            <span className="wizard-nav-label-full">Save as draft</span>
            <span className="wizard-nav-label-short">Draft</span>
          </button>
          {step < 3 ? (
            <button className="btn" onClick={goNext}>
              <span className="wizard-nav-label-full">
                Next: {STEPS[step - 1]!.navLabel} →
              </span>
              <span className="wizard-nav-label-short">Next →</span>
            </button>
          ) : (
            <button className="btn" disabled={busy || !title.trim()} onClick={() => save(true)}>
              {busy ? 'Saving…' : 'Publish combo'}
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
                <div className="wizard-step-title">{s.title}</div>
                <div className="wizard-step-sub">{s.sub}</div>
              </span>
            </button>
          ))}
        </div>

        <div className="wizard-tip wizard-tip-rail">
          <span>💡</span>
          <div>
            <strong>Tip</strong>
            {/* GRW-165 — future tense, deliberately. Nothing sends or receives a
                WhatsApp message yet, and a builder that says otherwise is
                selling the owner a feature they have not got. */}
            <div>Customers will be able to book this combo from your WhatsApp offers menu, once WhatsApp goes live for you.</div>
          </div>
        </div>
      </div>

      <div className="wizard-layout">
        <div className="card">
          <div className="card-body" style={{ paddingTop: 18 }}>
            {step === 1 && (
              <>
                <div className="wizard-section-title">1. Combo details</div>
                <div className="grid-2">
                  <div className="field">
                    <label>
                      <span>Combo name *</span>
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
                      placeholder="e.g. Weekend Glow Package"
                      className={fieldErrors.title ? 'field-invalid' : undefined}
                      style={{ width: '100%' }}
                    />
                    {fieldErrors.title && <div role="alert" className="field-error">{fieldErrors.title}</div>}
                  </div>
                  <div className="field">
                    <label>
                      <span>Tagline (optional)</span>
                      <span className="field-counter">
                        {description.length}/{TAGLINE_MAX}
                      </span>
                    </label>
                    <input
                      type="text"
                      value={description}
                      maxLength={TAGLINE_MAX}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Pamper yourself this weekend"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div className="wizard-section-title" style={{ marginTop: 22 }}>
                  2. Add services *
                </div>
                <p className="muted" style={{ marginTop: -8, marginBottom: 12, fontSize: 13.5 }}>
                  Search and add the services you want to include in this combo.
                </p>
                <div className="picker-search" style={{ marginTop: 8 }}>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${services.length} services…`}
                    className={fieldErrors.services ? 'field-invalid' : undefined}
                    style={{ width: '100%', paddingRight: search ? 36 : undefined }}
                  />
                  {search !== '' && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
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
                        <span className="muted">No matching services</span>
                      </div>
                    ) : (
                      filteredServices.slice(0, 20).map((s) => (
                        <div key={s.id} className="picker-row" onClick={() => addService(s.id)}>
                          { }
                          <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={36} height={36} />
                          <div style={{ flex: 1 }}>
                            <div className="picker-row-name">{s.name}</div>
                            <div className="picker-row-meta">{s.durationMin} min</div>
                          </div>
                          <span className="picker-row-price">{formatMoney(s.priceMinor)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div className="picked-list">
                  {selectedServices.length === 0 ? (
                    <div className="empty">Search above and tap a service to add it.</div>
                  ) : (
                    selectedServices.map((s, i) => (
                      <div key={s.id} className="picked-row">
                        <div className="picked-row-order">
                          <button disabled={i === 0} onClick={() => moveService(i, -1)} aria-label="Move up">
                            ▲
                          </button>
                          <button
                            disabled={i === selectedServices.length - 1}
                            onClick={() => moveService(i, 1)}
                            aria-label="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        { }
                        <img className="picker-row-thumb" src={servicePhotoUrl(s)} alt="" width={36} height={36} />
                        <div className="picked-row-main">
                          <div className="picker-row-name">{s.name}</div>
                          <div className="picker-row-meta">{s.durationMin} min</div>
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
                  3. Pricing
                </div>
                <div className="price-panel">
                  <div className="price-panel-cell">
                    <label>Original price</label>
                    <div className="price-panel-value">{formatMoney(String(originalPriceMinor))}</div>
                  </div>
                  <div className="price-panel-cell">
                    <label>Combo price</label>
                    <div className="price-mode-toggle">
                      <button className={priceMode === 'flat' ? 'active' : ''} onClick={() => switchPriceMode('flat')}>
                        Flat ₹
                      </button>
                      <button className={priceMode === 'percent' ? 'active' : ''} onClick={() => switchPriceMode('percent')}>
                        % off
                      </button>
                    </div>
                    {priceMode === 'flat' ? (
                      <input
                        type="number"
                        min="0"
                        value={flatInput}
                        onChange={(e) => setFlatInput(e.target.value)}
                        placeholder="0"
                        style={{ width: '100%' }}
                      />
                    ) : (
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
                  </div>
                  <div className="price-panel-cell">
                    <label>You save</label>
                    <div className="price-panel-value" style={{ color: 'var(--accent-deep)' }}>
                      {savingsMinor != null && savingsMinor >= 0
                        ? `${formatMoney(String(savingsMinor))} (${savingsPct}%)`
                        : '—'}
                    </div>
                  </div>
                </div>
                {comboPriceMinor != null && (
                  <div className="savings-banner">
                    Customers pay {formatMoney(String(comboPriceMinor))} instead of {formatMoney(String(originalPriceMinor))}
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Control which days this combo is offered — useful for weekend specials or a one-day flash deal.
                </p>
                {(
                  [
                    { key: 'always' as const, title: 'Always visible', sub: 'Shown to customers every day' },
                    { key: 'weekdays' as const, title: 'Only on selected weekdays', sub: 'e.g. weekends only' },
                    { key: 'window' as const, title: 'Only within a date window', sub: 'e.g. this Saturday, or the next 24 hours' },
                  ] as const
                ).map((opt) => (
                  <div key={opt.key}>
                    <label className="rules-option">
                      <input
                        type="radio"
                        name="visibility"
                        checked={visibilityMode === opt.key}
                        onChange={() => setVisibilityMode(opt.key)}
                      />
                      <div className="rules-option-body">
                        <div className="rules-option-title">{opt.title}</div>
                        <div className="rules-option-sub">{opt.sub}</div>
                      </div>
                    </label>
                    {opt.key === 'weekdays' && visibilityMode === 'weekdays' && (
                      <div className="weekday-picker">
                        {WEEKDAY_NAMES.map((name, i) => (
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
                    {opt.key === 'window' && visibilityMode === 'window' && (
                      <div className="date-window">
                        <div className="field">
                          <label>From (optional)</label>
                          <input
                            type="datetime-local"
                            value={visibleFromInput}
                            onChange={(e) => setVisibleFromInput(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>Until (optional)</label>
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
                  Check the summary on the right, then publish — or go back if anything needs changing. WhatsApp itself
                  shows this as plain text (no photos or styling — see the details in Try WhatsApp), so this preview is
                  a dashboard-side summary, not a screenshot of the real chat.
                </p>
                {selectedServices.length === 0 ? (
                  <div className="empty">Add services in the Build step before publishing.</div>
                ) : (
                  <div className="preview-facts" style={{ borderTop: 'none', paddingTop: 0, marginTop: 4 }}>
                    <div className="preview-fact">
                      <span>🎁</span>
                      {title || 'Untitled combo'}
                    </div>
                    <div className="preview-fact">
                      <span>🧾</span>
                      {selectedServices.length} service{selectedServices.length === 1 ? '' : 's'} ·{' '}
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
                  ← Back
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="wizard-sidebar">
        <div className="card">
          <div className="card-head">
            <span>Preview</span>
            <div className="device-toggle">
              <button
                className={previewDevice === 'mobile' ? 'active' : ''}
                aria-label="Preview as mobile"
                onClick={() => setPreviewDevice('mobile')}
              >
                📱
              </button>
              <button
                className={previewDevice === 'desktop' ? 'active' : ''}
                aria-label="Preview as desktop"
                onClick={() => setPreviewDevice('desktop')}
              >
                🖥️
              </button>
            </div>
          </div>
          <div className="card-body">
            {selectedServices.length === 0 ? (
              <div className="empty">Add services to see the preview.</div>
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
                <div className="preview-caption">📲 Will be bookable from WhatsApp</div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
