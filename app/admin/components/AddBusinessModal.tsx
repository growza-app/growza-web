'use client';

import { useEffect, useId, useState } from 'react';
import { adminFetch, AdminApiError } from '../lib/api';
import { oklch } from '../tokens';
import { ERROR_COLOR, Field, PrimaryButton, SecondaryButton, Select, TextInput } from './primitives';
import { BranchFields, emptyBranch, type Branch } from './BranchFields';
import { DIAL_CODES, validate } from '../lib/enrol-validation';

/**
 * Jira GRW-138 · GRW-175 — Add a business.
 *
 * The first screen in the admin plane that creates a customer rather than
 * reading or restricting one. Two things about it are deliberate:
 *
 *  - **It offers only real choices.** Verticals and their versions come from
 *    `/business-types` (which reads `business_type_version`) and plans from
 *    `/plans`. A hardcoded list here would be a place the vertical catalogue
 *    could drift, and the form would then offer something provisioning
 *    refuses.
 *  - **It validates nothing the server does not.** Every rule — the
 *    permissibility gate, the duplicate check, the phone format — lives in
 *    `modules/onboarding` and is reported back through the field it belongs
 *    to. The form's own checks are only there to save a round trip, never to
 *    be the decision.
 */
/** Enough to enrol the pilot cohort. A full IANA picker is not what this screen is for. */
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

const FIELD_FOR_ERROR: Record<string, string> = {
  duplicate_business: 'name',
  geography_forbidden: 'country',
  owner_exists: 'owner.phone',
  plan_retired: 'planCode',
  plan_not_found: 'planCode',
  business_type_not_found: 'businessTypeCode',
  vertical_version_not_found: 'businessTypeCode',
};

export interface CreatedBusiness {
  id: string;
  ownerTemporaryPassword: string;
  catalog: { categories: number; services: number };
}

interface BusinessType {
  code: string;
  name: string;
  versions: number[];
}

interface PlanOption {
  code: string;
  name: string;
  status: string;
}

/** The unset state of a select that must be chosen, not defaulted. */
const CHOOSE = 'Choose…';

export function AddBusinessModal({ onClose, onCreated }: { onClose: () => void; onCreated: (created: CreatedBusiness) => void }) {
  const ids = useId();
  const [types, setTypes] = useState<BusinessType[] | null>(null);
  const [plans, setPlans] = useState<PlanOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('IN');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [typeCode, setTypeCode] = useState('');
  const [planCode, setPlanCode] = useState('');
  /**
   * Always an array, even for a single-branch business.
   *
   * The toggle changes what is SHOWN, not what is sent — the request carries
   * `locations: [...]` either way, so nothing downstream has to ask which kind
   * of business this is. Turning the toggle off keeps whatever was typed rather
   * than discarding it, because a mis-click should not cost an admin four
   * addresses; only the first is submitted.
   */
  const [multiBranch, setMultiBranch] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([emptyBranch()]);
  const visibleBranches = multiBranch ? branches : branches.slice(0, 1);

  const setBranch = (index: number, patch: Partial<Branch>) =>
    setBranches((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const [nationalNumber, setNationalNumber] = useState('');
  const [reason, setReason] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Field name -> message. Populated on submit, and cleared per field as it is edited. */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clear = (field: string) => setErrors((e) => (e[field] ? { ...e, [field]: '' } : e));

  const dialCode = DIAL_CODES[country.trim().toUpperCase()] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      adminFetch<BusinessType[]>('/business-types', { signal: controller.signal }),
      adminFetch<{ rows: PlanOption[] } | PlanOption[]>('/plans', { signal: controller.signal }),
    ])
      .then(([businessTypes, planResult]) => {
        if (controller.signal.aborted) return;
        setTypes(businessTypes);
        // Deliberately NOT defaulted to the first type.
        //
        // The vertical is PINNED on the tenant at creation and there is no way
        // to change it afterwards — it decides the labels, the flow, the seed
        // catalogue and the permissibility rules. Defaulting the field meant
        // the list happened to be alphabetical, so "Clinic" sat pre-selected on
        // a form for a salon product, and an admin who did not look would
        // create a business that cannot be corrected. An unset select costs one
        // deliberate click and removes the whole class of mistake.
        const rows = Array.isArray(planResult) ? planResult : planResult.rows;
        const sellable = rows.filter((p) => p.status !== 'retired');
        setPlans(sellable);
        setPlanCode((current) => current || sellable[0]?.code || '');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof AdminApiError ? err.message : 'Could not load the options for this form.');
      });
    return () => controller.abort();
  }, []);

  const selectedType = types?.find((t) => t.code === typeCode);
  const errorFor = (field: string) => errors[field] || undefined;

  async function submit() {
    setFormError(null);

    const found = validate({ name, country, typeCode, planCode, branches: visibleBranches, nationalNumber, dialCode, reason });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const created = await adminFetch<CreatedBusiness>('/businesses', {
        method: 'POST',
        body: JSON.stringify({
          name,
          country: country.toUpperCase(),
          timezone,
          businessTypeCode: typeCode,
          // The newest version that exists. Pinning is provisioning's job; the
          // form must not invent a version number of its own.
          businessTypeVersion: selectedType?.versions.at(-1) ?? 1,
          planCode,
          locations: visibleBranches.map((branch) => ({
            name: branch.name.trim(),
            address:
              branch.line1.trim() || branch.city.trim()
                ? {
                    ...(branch.line1.trim() ? { line1: branch.line1.trim() } : {}),
                    ...(branch.city.trim() ? { city: branch.city.trim() } : {}),
                  }
                : undefined,
          })),
          /**
           * Composed here, so what the route receives is always E.164 and the
           * admin never typed a `+`. A pasted `+919876543210`, `919876543210`
           * or `09876543210` all reduce to the same ten digits below.
           */
          owner: { phone: `${dialCode}${nationalNumber.replace(/\D/g, '')}` },
          reason,
        }),
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof AdminApiError) {
        // The server decides. Its refusal is shown against the field it is
        // about — the field it named itself, or the one its error code maps to
        // — and as a banner when it is about the request as a whole, because a
        // provider being down is nobody's typo.
        const field = err.field ?? (err.code ? FIELD_FOR_ERROR[err.code] : undefined);
        if (field) setErrors({ [field]: err.message });
        else setFormError(err.message);
      } else {
        setFormError('Could not create this business.');
      }
      setSaving(false);
    }
  }

  // Presence only. Whether the values are RIGHT is `validate`'s answer, given
  // on submit against the field — a button that stays grey without saying why
  // is the worse of the two failures.
  const complete =
    name && country && typeCode && planCode && visibleBranches.every((b) => b.name.trim()) && nationalNumber && reason;

  return (
    <div
      className="admin-dialog-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'oklch(0.2 0.02 155 / 0.5)',
      }}
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onClick={(e) => e.stopPropagation()}
        /**
         * A column whose MIDDLE scrolls, not the whole card.
         *
         * With the card itself scrolling, "Create business" sat below the fold
         * the moment the form got its eleventh field — the same "Save below the
         * fold" defect GRW-024 fixed on the tenant side. The header says what
         * this is and the actions are always reachable; only the fields move.
         */
        style={{
          width: 'min(640px, 100%)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'white',
          borderRadius: 18,
          boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)',
        }}
      >
        <div style={{ padding: '22px 24px 0', flexShrink: 0 }}>
          <h3 id={`${ids}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: oklch.textStrong }}>
            Add a business
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: oklch.textMuted }}>
            The business is created ready to set up — it does not start taking bookings until it is made live.
          </p>
        </div>

        <div style={{ padding: '18px 24px 8px', display: 'grid', gap: 14, overflowY: 'auto', minHeight: 0 }}>
          {loadError ? <ErrorText text={loadError} /> : null}
          {formError ? <ErrorText text={formError} /> : null}

          <Field label="Business name" error={errorFor('name')}>
            <TextInput
              value={name}
              invalid={!!errorFor('name')}
              onChange={(e) => {
                setName(e.target.value);
                clear('name');
              }}
              placeholder="Glow Salon"
            />
          </Field>

          <Row>
            <Field label="Country" error={errorFor('country')}>
              <TextInput
                value={country}
                maxLength={2}
                invalid={!!errorFor('country')}
                onChange={(e) => {
                  setCountry(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase());
                  clear('country');
                  clear('owner.phone');
                }}
                placeholder="IN"
              />
            </Field>
            <Field label="Timezone">
              <Select options={TIMEZONES} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </Field>
          </Row>

          <Row>
            <Field label="Type of business" hint="Cannot be changed later" error={errorFor('businessTypeCode')}>
              <Select
                options={[CHOOSE, ...(types ?? []).map((t) => t.name)]}
                value={selectedType?.name ?? CHOOSE}
                invalid={!!errorFor('businessTypeCode')}
                onChange={(e) => {
                  setTypeCode(types?.find((t) => t.name === e.target.value)?.code ?? '');
                  clear('businessTypeCode');
                }}
              />
            </Field>
            <Field label="Plan" error={errorFor('planCode')}>
              <Select
                options={(plans ?? []).map((p) => p.name)}
                value={plans?.find((p) => p.code === planCode)?.name ?? ''}
                onChange={(e) => setPlanCode(plans?.find((p) => p.name === e.target.value)?.code ?? '')}
              />
            </Field>
          </Row>

          <BranchFields
            branches={visibleBranches}
            multiBranch={multiBranch}
            errorFor={errorFor}
            onToggle={() => {
              const next = !multiBranch;
              setMultiBranch(next);
              // A second row appears as soon as it is asked for, rather than
              // making the admin find an "add" button to discover what the
              // toggle did.
              if (next && branches.length === 1) setBranches((rows) => [...rows, emptyBranch()]);
            }}
            onChange={(index, patch, field) => {
              setBranch(index, patch);
              clear(`branch.${index}.${field}`);
            }}
            onAdd={() => setBranches((rows) => [...rows, emptyBranch()])}
            onRemove={(index) => {
              setBranches((rows) => rows.filter((_, i) => i !== index));
              // Indices shift, so keeping per-branch errors would show them
              // against the wrong rows.
              setErrors({});
            }}
          />

          <Row>
            <Field
              label="Owner’s phone"
              id={`${ids}-owner-phone`}
              hint={dialCode ? `${dialCode} is added automatically` : 'No dial code known for this country — enter the full number'}
              error={errorFor('owner.phone')}
            >
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                {dialCode ? (
                  <span
                    // Not an input. A prefix an admin can edit is a prefix an
                    // admin can break, and forgetting it is the thing this
                    // field exists to make impossible.
                    aria-hidden="true"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 12px',
                      borderRadius: '11px 0 0 11px',
                      border: `1px solid ${errorFor('owner.phone') ? ERROR_COLOR : oklch.borderStrong}`,
                      borderRight: 'none',
                      background: 'oklch(0.95 0.01 155)',
                      fontSize: 14,
                      fontWeight: 700,
                      color: oklch.textMuted,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dialCode}
                  </span>
                ) : null}
                <TextInput
                  id={`${ids}-owner-phone`}
                  value={nationalNumber}
                  invalid={!!errorFor('owner.phone')}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  aria-label={dialCode ? `Owner's phone number, ${dialCode}` : "Owner's phone number"}
                  onChange={(e) => {
                    // Digits only, and a pasted +91…/91…/0… reduces to the same
                    // national number rather than being rejected.
                    let digits = e.target.value.replace(/\D/g, '');
                    const bare = dialCode?.replace('+', '');
                    if (bare && digits.startsWith(bare) && digits.length > bare.length) digits = digits.slice(bare.length);
                    if (dialCode === '+91' && digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
                    setNationalNumber(digits.slice(0, 15));
                    clear('owner.phone');
                  }}
                  placeholder={dialCode === '+91' ? '9876543210' : 'Phone number'}
                  style={dialCode ? { borderRadius: '0 11px 11px 0' } : undefined}
                />
              </div>
            </Field>
          </Row>

          <Field
            label="Why is this being created?"
            hint="Recorded against your name in the audit trail"
            error={errorFor('reason')}
          >
            <TextInput
              value={reason}
              maxLength={500}
              invalid={!!errorFor('reason')}
              onChange={(e) => {
                setReason(e.target.value);
                clear('reason');
              }}
              placeholder="Signed up on a call"
            />
          </Field>

        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 24px 20px',
            flexShrink: 0,
            borderTop: `1px solid ${oklch.borderStrong}`,
          }}
        >
          <SecondaryButton onClick={onClose} disabled={saving}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving || !complete || !types || !plans}>
            {saving ? 'Creating…' : 'Create business'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/**
 * What the admin is handed once, and the warning that it is once.
 *
 * Separate from the form on purpose: the credential is not part of "did the
 * thing work", it is a thing to be carried out of this screen and given to a
 * person. Closing this is the only place it disappears from.
 */
export function OwnerCredentialNotice({ created, onClose }: { created: CreatedBusiness; onClose: () => void }) {
  const ids = useId();
  return (
    <div
      className="admin-dialog-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'oklch(0.2 0.02 155 / 0.5)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        style={{ width: 'min(520px, 100%)', background: 'white', borderRadius: 18, padding: 24, boxShadow: '0 24px 60px oklch(0.2 0.04 155 / 0.35)' }}
      >
        <h3 id={`${ids}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 800, color: oklch.textStrong }}>
          Business created
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: oklch.textMuted }}>
          {created.catalog.services} services were added from the ready-made catalogue. Give the owner this one-time password —
          <strong> it cannot be shown again.</strong>
        </p>
        <div
          style={{
            margin: '16px 0',
            padding: '12px 14px',
            borderRadius: 10,
            background: 'oklch(0.96 0.01 155)',
            border: `1px solid ${oklch.borderStrong}`,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 15,
            fontWeight: 700,
            wordBreak: 'break-all',
          }}
        >
          {created.ownerTemporaryPassword}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <PrimaryButton onClick={onClose}>I have saved it</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 14 }}>{children}</div>;
}

function ErrorText({ text }: { text: string }) {
  return <div style={{ fontSize: 13.5, fontWeight: 700, color: 'oklch(0.5 0.18 25)' }}>{text}</div>;
}
