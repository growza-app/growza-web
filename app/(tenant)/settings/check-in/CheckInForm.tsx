'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type BranchSettings } from '../../lib/api';
import { getFix, pinFromText } from '../../lib/geo-fix';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { useCloseAfterSave } from '../../lib/close-after-save';
import { useWritable } from '../../components/SessionProvider';

/**
 * 50 m is a shop; 500 m is a street. The API refuses anything outside (and so does the column's own CHECK,
 * migration 0106), so the field says the same two numbers rather than letting a save fail to say them.
 */
const RADIUS_MIN_M = 50;
const RADIUS_MAX_M = 500;

/**
 * Jira GRW-563 — where the branch is, how close counts, and who approves the rest.
 *
 * No map. The owner stands in the salon and taps "Use where I am now", or pastes a maps share link; the
 * pin is shown back as plain numbers and a "set" / "not set" line, which is all a fence needs. Plain words
 * throughout: an owner may not know what a radius is, and does know what "how close counts" means.
 */
export function CheckInForm({ branch, branchName, branchCount }: { branch: BranchSettings; branchName: string | null; branchCount: number }) {
  const t = useTranslations('settingsCheckIn');
  const writable = useWritable();
  const closeForm = useCloseAfterSave('/settings');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(branch.geoLat != null && branch.geoLng != null ? { lat: branch.geoLat, lng: branch.geoLng } : null);
  const [link, setLink] = useState('');
  /*
   * Typed, not picked from a list (owner, 2026-10-11). The six choices were a guess at the salons that exist,
   * and a shop that needs 80 m had to take 100. Held as TEXT while the owner types — a number state cannot
   * hold the empty box between clearing it and typing the first digit, which is what makes a numeric input
   * fight back on a phone.
   */
  const [radiusText, setRadiusText] = useState(String(branch.geoRadiusM ?? 100));
  const radius = Number(radiusText);
  const [enabled, setEnabled] = useState(branch.geoEnabled ?? false);
  const [deskApproves, setDeskApproves] = useState(branch.geoDeskApproves ?? false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const useHere = async () => {
    setLocating(true);
    setError(null);
    const fix = await getFix();
    setLocating(false);
    if (!fix) {
      setError(t('errors.noFix'));
      return;
    }
    setPin({ lat: fix.lat, lng: fix.lng });
    setLink('');
  };

  const linkChanged = (text: string) => {
    setLink(text);
    setError(null);
    if (!text.trim()) return;
    const found = pinFromText(text);
    if (found) setPin(found);
  };

  const save = async () => {
    if (link.trim() && !pinFromText(link)) {
      setError(t('errors.noPlaceInLink'));
      return;
    }
    // Said here rather than let the API say it: the same two numbers are already on the screen as a hint.
    if (!Number.isInteger(radius) || radius < RADIUS_MIN_M || radius > RADIUS_MAX_M) {
      setError(t('errors.badRadius', { min: RADIUS_MIN_M, max: RADIUS_MAX_M }));
      return;
    }
    if (enabled && !pin) {
      setError(t('errors.pinFirst'));
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateBranch(branch.id, { geoPin: pin, geoRadiusM: radius, geoEnabled: enabled, geoDeskApproves: deskApproves });
      setSaved(true);
      closeForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => n.toFixed(5);
  /** Opens wherever the phone sends maps links — Google Maps' documented search URL, no key, no embed. */
  const mapsUrl = (p: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

  return (
    <>
    <div className="card ci-settings">
      <div className="card-head">{branchCount > 1 && branchName ? t('titleBranch', { name: branchName }) : t('title')}</div>
      <div className="card-body">
        <p className="field-hint ci-settings-intro">{t('intro')}</p>

        <div className="field">
          <span className="field-label">{t('pinLabel')}</span>
          {/*
           * Words first, numbers second. Latitude and longitude are the one thing on this screen an owner
           * cannot check by reading it, so the line that matters says the pin is saved and the numbers sit
           * under it in the hint's size — and "See on map" is what actually lets them check it.
           */}
          <div aria-live="polite">
            <p className={`ci-pin ${pin ? 'is-set' : ''}`}>{pin ? t('pinSaved') : t('pinNotSet')}</p>
            {pin ? (
              <p className="ci-pin-coords">
                {t('pinCoords', { lat: fmt(pin.lat), lng: fmt(pin.lng) })}
                <a className="ci-map" href={mapsUrl(pin)} target="_blank" rel="noreferrer">
                  {t('seeOnMap')}
                </a>
              </p>
            ) : null}
          </div>
          <div className="ci-pin-actions">
            <button type="button" className="btn ci-here" disabled={locating || busy || !writable} onClick={() => void useHere()}>
              {locating ? t('finding') : t('useHere')}
            </button>
            {pin ? (
              <button type="button" className="btn-ghost" disabled={busy || !writable} onClick={() => { setPin(null); setEnabled(false); setLink(''); }}>
                {t('clearPin')}
              </button>
            ) : null}
          </div>
          <span className="field-hint">{t('useHereHint')}</span>
        </div>

        <label className="field">
          <span className="field-label">{t('linkLabel')}</span>
          <input type="url" inputMode="url" value={link} placeholder={t('linkPlaceholder')} disabled={busy || !writable} onChange={(e) => linkChanged(e.target.value)} />
          <span className="field-hint">{t('linkHint')}</span>
        </label>

        <label className="field">
          <span className="field-label">{t('radiusLabel')}</span>
          {/* `m` is welded to the box, like the dial code on a phone field: a unit to read, never a thing to type. */}
          <span className="ci-radius">
            <input
              type="text"
              inputMode="numeric"
              /* Digits only, and never longer than "500" — the box cannot hold a number the API would refuse. */
              value={radiusText}
              maxLength={3}
              disabled={busy || !writable}
              aria-describedby="ci-radius-hint"
              onChange={(e) => {
                setRadiusText(e.target.value.replace(/\D/g, '').slice(0, 3));
                setError(null);
              }}
            />
            <span className="ci-radius-unit" aria-hidden="true">
              {t('radiusUnit')}
            </span>
          </span>
          <span className="field-hint" id="ci-radius-hint">
            {t('radiusHint')}
          </span>
        </label>

        <div className="ci-switch-row">
          <label className="switch">
            <input type="checkbox" aria-labelledby="ci-enabled-label" checked={enabled} disabled={busy || !writable} onChange={() => setEnabled((v) => !v)} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
          <div>
            <div id="ci-enabled-label" className="ci-switch-title">{t('enabled')}</div>
            <span className="field-hint">{enabled ? t('enabledOn') : t('enabledOff')}</span>
          </div>
        </div>

        <div className="ci-switch-row">
          <label className="switch">
            <input type="checkbox" aria-labelledby="ci-desk-label" checked={deskApproves} disabled={busy || !writable} onChange={() => setDeskApproves((v) => !v)} />
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
          </label>
          <div>
            <div id="ci-desk-label" className="ci-switch-title">{t('deskApproves')}</div>
            <span className="field-hint">{t('deskApprovesHint')}</span>
          </div>
        </div>

        {error ? (
          <div role="alert" className="field-error">
            {error}
          </div>
        ) : null}
      </div>
    </div>
    {/*
     * Outside the card, as every other settings form has it (BookingRulesForm). `.card` clips its rounded
     * corners with `overflow: hidden`, and that cancels the bar's `position: sticky` — inside the card it
     * never pinned, it just sat at the end of the form, underneath the floating bottom nav. Measured at
     * 344x882: the nav, not the button, answered a tap at the centre of Save.
     */}
    <SettingsSaveBar busy={busy} saved={saved} onSave={() => void save()} saveLabel={t('save')} savingLabel={t('saving')} savedLabel={t('savedLabel')} />
    </>
  );
}
