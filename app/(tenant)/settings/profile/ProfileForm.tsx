'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { PhoneField } from '../../components/PhoneField';
import { IconCheck, IconChevronRight, IconMapPin, IconPhone, IconShop } from '../../components/icons';
import { fromStoredPhone, toStoredPhone } from '../../lib/phone';
import { api, type SettingsSummary } from '../../lib/api';
import { BranchScopeNote } from '../BranchScopeNote';

/**
 * Jira GRW-226 — Business profile, as a form that fits a laptop and a phone.
 *
 * The first version was one flat column of inline-styled fields, and every
 * text input rendered at the global `min-width: 180px` — so the address was
 * cut off inside a 640px card, the character counters floated at the card's
 * far edge, and on a phone Save was a long scroll away. Now:
 *
 * - four cards a salon owner recognises: logo, the business, where it is, how
 *   to reach it;
 * - fields that fill their column, two to a row on a laptop, one on a phone;
 * - a Save bar pinned to the bottom of the scroll area, disabled until
 *   something has changed, so "did that save?" always has an answer on screen.
 */

/** Each zone's name lives in `settingsProfile.timezones`; the value sent to the API is the IANA name. */
const TIMEZONES = [
  { value: 'Asia/Kolkata', key: 'india' },
  { value: 'Asia/Dubai', key: 'uae' },
  { value: 'Asia/Karachi', key: 'pakistan' },
  { value: 'Asia/Dhaka', key: 'bangladesh' },
  { value: 'Asia/Colombo', key: 'sriLanka' },
  { value: 'Asia/Kathmandu', key: 'nepal' },
] as const;

const NAME_MAX = 50;
const ADDRESS_MAX = 100;
const DESCRIPTION_MAX = 200;

type Fields = {
  name: string;
  timezone: string;
  phone: string;
  description: string;
  locationName: string;
  addressLine1: string;
  addressCity: string;
};

function fieldsOf(s: SettingsSummary): Fields {
  return {
    name: s.tenant.name,
    timezone: s.tenant.timezone,
    // GRW-199 — the field holds ten NATIONAL digits; the stored value is E.164.
    phone: fromStoredPhone(s.tenant.phone),
    description: s.tenant.description,
    locationName: s.location?.name ?? '',
    addressLine1: s.location?.addressLine1 ?? '',
    addressCity: s.location?.addressCity ?? '',
  };
}

export function ProfileForm({
  initial,
  branchCount = 1,
  branchName = null,
}: {
  initial: SettingsSummary;
  branchCount?: number;
  /** Jira GRW-230 — set when a branch is picked: this is that branch's profile. */
  branchName?: string | null;
}) {
  const t = useTranslations('settingsProfile');
  const tCommon = useTranslations('common');
  const branchId = initial.scope.locationId;
  const [settings, setSettings] = useState(initial);
  const [savedFields, setSavedFields] = useState<Fields>(() => fieldsOf(initial));
  const [f, setF] = useState<Fields>(() => fieldsOf(initial));
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setF((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    if (key === 'name') setNameError(false);
  };
  const dirty = (Object.keys(f) as Array<keyof Fields>).some((k) => f[k] !== savedFields[k]);
  const multiBranch = branchCount > 1;

  const save = async () => {
    if (branchId) {
      // Jira GRW-230 — a branch's name, address, phone and "about". The business's name and logo are not a branch's.
      if (!f.locationName.trim()) {
        setError(t('errors.branchNameEmpty'));
        return;
      }
      setBusy(true);
      setError(null);
      setSaved(false);
      try {
        const { locationName, addressLine1, addressCity, description } = f;
        const updated = await api.updateProfile({ locationName, addressLine1, addressCity, description, phone: toStoredPhone(f.phone) ?? '' }, branchId);
        setSettings(updated);
        setSavedFields(fieldsOf(updated));
        setF(fieldsOf(updated));
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error && /already has this name/.test(e.message) ? e.message : t('errors.saveFailed'));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!f.name.trim()) {
      setNameError(true);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      // Jira GRW-227 — a multi-branch business edits branches on Settings ›
      // Branches; this screen sends no branch fields at all for it.
      const { locationName, addressLine1, addressCity, ...business } = f;
      const updated = await api.updateProfile({
        ...business,
        phone: toStoredPhone(f.phone) ?? '',
        ...(multiBranch ? {} : { locationName, addressLine1, addressCity }),
      });
      setSettings(updated);
      const next = fieldsOf(updated);
      setSavedFields(next);
      setF(next);
      setSaved(true);
    } catch {
      setError(t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onLogoChosen = async (file: File | undefined) => {
    if (!file) return;
    setLogoBusy(true);
    setError(null);
    try {
      setSettings(await api.uploadBusinessLogo(file));
    } catch {
      setError(t('errors.logoFailed'));
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <form
      className="bp-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="bp-intro">
        <h2 className="bp-title">{branchId ? (branchName ? t('branchTitleNamed', { name: branchName }) : t('branchTitleUnnamed')) : t('title')}</h2>
        <p className="bp-sub">{branchId ? t('subBranch') : t('sub')}</p>
      </div>
      <BranchScopeNote settings={settings} branchName={branchName} keys={['business_phone', 'business_description']} topic="phoneAndDescription" />

      <div className="bp-columns">
      <div className="bp-col">
      {branchId ? (
        <section className="card bp-card">
          <div className="bp-card-head">
            <span className="bp-card-icon">
              <IconMapPin />
            </span>
            <div className="bp-card-title">{t('cards.thisBranch')}</div>
          </div>
          <div className="bp-grid">
            <div className="field">
              <label htmlFor="bp-location">
                <span>{t('fields.branchName')}</span>
              </label>
              <input id="bp-location" type="text" value={f.locationName} maxLength={50} onChange={(e) => set('locationName', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="bp-city">
                <span>{t('fields.city')}</span>
              </label>
              <input id="bp-city" type="text" value={f.addressCity} onChange={(e) => set('addressCity', e.target.value)} />
            </div>
            <div className="field bp-span">
              <label htmlFor="bp-address">
                <span>{t('fields.address')}</span>
                <span className="field-counter">
                  {f.addressLine1.length}/{ADDRESS_MAX}
                </span>
              </label>
              <input id="bp-address" type="text" value={f.addressLine1} maxLength={ADDRESS_MAX} onChange={(e) => set('addressLine1', e.target.value)} placeholder={t('placeholders.address')} />
            </div>
            <div className="field bp-span">
              <label htmlFor="bp-description">
                <span>
                  {t('fields.aboutBranch')} <span className="field-optional">{tCommon('optional')}</span>
                </span>
                <span className="field-counter">
                  {f.description.length}/{DESCRIPTION_MAX}
                </span>
              </label>
              <textarea id="bp-description" value={f.description} maxLength={DESCRIPTION_MAX} onChange={(e) => set('description', e.target.value)} rows={3} />
            </div>
          </div>
        </section>
      ) : (
      <>
      <section className="card bp-card">
        <div className="bp-logo">
          <div className="bp-logo-preview">
            {settings.tenant.logoUrl ? <img src={settings.tenant.logoUrl} alt="" /> : settings.tenant.name.charAt(0).toUpperCase()}
          </div>
          <div className="bp-logo-text">
            <div className="bp-card-title">{t('logo.title')}</div>
            <div className="field-hint">{t('logo.hint')}</div>
          </div>
          <button type="button" className="bp-logo-btn" disabled={logoBusy} onClick={() => fileInputRef.current?.click()}>
            {logoBusy ? t('logo.uploading') : settings.tenant.logoUrl ? t('logo.change') : t('logo.upload')}
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onLogoChosen(e.target.files?.[0])} />
        </div>
      </section>

      <section className="card bp-card">
        <div className="bp-card-head">
          <span className="bp-card-icon">
            <IconShop />
          </span>
          <div className="bp-card-title">{t('cards.yourBusiness')}</div>
        </div>
        <div className="bp-grid">
          <div className="field">
            <label htmlFor="bp-name">
              <span>{t('fields.businessName')}</span>
              <span className="field-counter">
                {f.name.length}/{NAME_MAX}
              </span>
            </label>
            <input
              id="bp-name"
              type="text"
              value={f.name}
              maxLength={NAME_MAX}
              onChange={(e) => set('name', e.target.value)}
              className={nameError ? 'field-invalid' : ''}
              aria-invalid={nameError || undefined}
              aria-describedby={nameError ? 'bp-name-error' : undefined}
            />
            {nameError ? (
              <div role="alert" className="field-error" id="bp-name-error">
                {t('errors.nameEmpty')}
              </div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="bp-timezone">
              <span>{t('fields.timezone')}</span>
            </label>
            <select id="bp-timezone" value={f.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {t(`timezones.${tz.key}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field bp-span">
            <label htmlFor="bp-description">
              <span>
                {t('fields.aboutBusiness')} <span className="field-optional">{tCommon('optional')}</span>
              </span>
              <span className="field-counter">
                {f.description.length}/{DESCRIPTION_MAX}
              </span>
            </label>
            <textarea
              id="bp-description"
              value={f.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              placeholder={t('placeholders.description')}
            />
          </div>
        </div>
      </section>
      </>
      )}

      </div>
      <div className="bp-col">
      {branchId ? null : multiBranch ? (
        <a className="card bp-card bp-link-card" href="/settings/branches">
          <span className="bp-card-icon">
            <IconMapPin />
          </span>
          <span className="bp-link-body">
            <span className="bp-card-title">{t('cards.addresses')}</span>
            <span className="field-hint">{t('addressesHint', { count: branchCount })}</span>
          </span>
          <span className="bp-link-chev">
            <IconChevronRight />
          </span>
        </a>
      ) : settings.location ? (
        <section className="card bp-card">
          <div className="bp-card-head">
            <span className="bp-card-icon">
              <IconMapPin />
            </span>
            <div className="bp-card-title">{t('cards.whereYouAre')}</div>
          </div>
          <div className="bp-grid">
            <div className="field">
              <label htmlFor="bp-location">
                <span>{t('fields.branchName')}</span>
              </label>
              <input id="bp-location" type="text" value={f.locationName} onChange={(e) => set('locationName', e.target.value)} placeholder={t('placeholders.branchName')} />
            </div>
            <div className="field">
              <label htmlFor="bp-city">
                <span>{t('fields.city')}</span>
              </label>
              <input id="bp-city" type="text" value={f.addressCity} onChange={(e) => set('addressCity', e.target.value)} />
            </div>
            <div className="field bp-span">
              <label htmlFor="bp-address">
                <span>{t('fields.address')}</span>
                <span className="field-counter">
                  {f.addressLine1.length}/{ADDRESS_MAX}
                </span>
              </label>
              <input id="bp-address" type="text" value={f.addressLine1} maxLength={ADDRESS_MAX} onChange={(e) => set('addressLine1', e.target.value)} placeholder={t('placeholders.address')} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="card bp-card">
        <div className="bp-card-head">
          <span className="bp-card-icon">
            <IconPhone />
          </span>
          <div className="bp-card-title">{t('cards.contact')}</div>
        </div>
        <div className="bp-grid">
          {/* GRW-199 — the same field as everywhere else. Optional: a salon
              may not publish a number, and this one is display, not identity. */}
          <PhoneField id="business-phone" label={t('fields.businessPhone')} optionalLabel={tCommon('optional')} value={f.phone} onChange={(v) => set('phone', v)} />
        </div>
      </section>

      </div>
      </div>

      <div className="bp-savebar" role="status" aria-live="polite">
        <span className={`bp-save-state ${error ? 'is-error' : ''}`}>
          {error ? (
            error
          ) : saved && !dirty ? (
            <>
              <IconCheck /> {t('bar.saved')}
            </>
          ) : dirty ? (
            t('bar.unsaved')
          ) : (
            t('bar.allSaved')
          )}
        </span>
        <button type="submit" className="btn bp-save" disabled={busy || !dirty}>
          {busy ? t('bar.saving') : t('bar.save')}
        </button>
      </div>
    </form>
  );
}
