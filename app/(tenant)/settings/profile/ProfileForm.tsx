'use client';

import { useRef, useState } from 'react';
import { api, type SettingsSummary } from '../../lib/api';

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'Asia/Dubai', label: 'UAE (Asia/Dubai)' },
  { value: 'Asia/Karachi', label: 'Pakistan (Asia/Karachi)' },
  { value: 'Asia/Dhaka', label: 'Bangladesh (Asia/Dhaka)' },
  { value: 'Asia/Colombo', label: 'Sri Lanka (Asia/Colombo)' },
  { value: 'Asia/Kathmandu', label: 'Nepal (Asia/Kathmandu)' },
];

const NAME_MAX = 50;
const ADDRESS_MAX = 100;
const DESCRIPTION_MAX = 200;
const SAVE_ERROR = 'Could not save — check the server is running.';

export function ProfileForm({ initial }: { initial: SettingsSummary }) {
  const [settings, setSettings] = useState(initial);
  const [name, setName] = useState(initial.tenant.name);
  const [timezone, setTimezone] = useState(initial.tenant.timezone);
  const [phone, setPhone] = useState(initial.tenant.phone);
  const [email, setEmail] = useState(initial.tenant.email);
  const [description, setDescription] = useState(initial.tenant.description);
  const [locationName, setLocationName] = useState(initial.location?.name ?? '');
  const [addressLine1, setAddressLine1] = useState(initial.location?.addressLine1 ?? '');
  const [addressCity, setAddressCity] = useState(initial.location?.addressCity ?? '');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!name.trim()) {
      setError('Business name cannot be empty');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateProfile({
        name,
        timezone,
        phone,
        email,
        description,
        locationName,
        addressLine1,
        addressCity,
      });
      setSettings(updated);
      setSaved(true);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const onLogoChosen = async (file: File | undefined) => {
    if (!file) return;
    setLogoBusy(true);
    setError(null);
    try {
      const updated = await api.uploadBusinessLogo(file);
      setSettings(updated);
    } catch {
      setError('Could not upload logo — check the server is running.');
    } finally {
      setLogoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="card">
      <div className="card-head">Business profile</div>
      <div className="card-body">
        <div className="field">
          <label>
            <span>Business logo</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--accent-soft)',
                color: 'var(--accent-deep)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 26,
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {settings.tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.tenant.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                settings.tenant.name.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <button type="button" className="btn btn-ghost" disabled={logoBusy} onClick={() => fileInputRef.current?.click()}>
                {logoBusy ? 'Uploading…' : 'Change logo'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => onLogoChosen(e.target.files?.[0])}
              />
              <div className="field-hint">JPG, PNG, or WEBP — up to 5MB.</div>
            </div>
          </div>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label>
            <span>Business name</span>
            <span className="field-counter">
              {name.length}/{NAME_MAX}
            </span>
          </label>
          <input
            type="text"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className={error ? 'field-invalid' : ''}
          />
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>Timezone</span>
          </label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {initial.location && (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label>
                <span>Location name</span>
              </label>
              <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>
                <span>Business address</span>
                <span className="field-counter">
                  {addressLine1.length}/{ADDRESS_MAX}
                </span>
              </label>
              <input
                type="text"
                value={addressLine1}
                maxLength={ADDRESS_MAX}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Street, area"
              />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>
                <span>City</span>
              </label>
              <input type="text" value={addressCity} onChange={(e) => setAddressCity(e.target.value)} />
            </div>
          </>
        )}

        <div className="grid-2" style={{ marginTop: 14, gap: 14 }}>
          <div className="field">
            <label>
              <span>Business phone</span>
            </label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 12345" />
          </div>
          <div className="field">
            <label>
              <span>Business email</span>
            </label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>Business description (optional)</span>
            <span className="field-counter">
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </label>
          <textarea
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div className="field-hint" style={{ marginTop: 14 }}>
          These details are what your customers see when they book with you.
        </div>

        {error && <div className="field-error">{error}</div>}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {saved && !busy && (
            <span className="field-hint" style={{ margin: 0, color: 'var(--accent-deep)' }}>
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
