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
const RADIUS_MIN_M = 0;
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
   * The pin as the two numbers an owner can read, copy and type. Held as TEXT for the same reason the radius is:
   * "12." is a half-typed number, and a number state cannot hold it. A valid pair is promoted to `pin`.
   */
  const [latText, setLatText] = useState(branch.geoLat != null ? String(Number(branch.geoLat.toFixed(6))) : '');
  const [lngText, setLngText] = useState(branch.geoLng != null ? String(Number(branch.geoLng.toFixed(6))) : '');
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
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
    showPin({ lat: fix.lat, lng: fix.lng });
    setAccuracyM(fix.accuracyM);
    setLink('');
  };

  /** One place a pin is set, so the numbers on screen are always the numbers that will be saved. */
  const showPin = (p: { lat: number; lng: number }) => {
    setPin(p);
    setLatText(String(Number(p.lat.toFixed(6))));
    setLngText(String(Number(p.lng.toFixed(6))));
    setAccuracyM(null);
  };

  const coordsChanged = (nextLat: string, nextLng: string) => {
    setLatText(nextLat);
    setLngText(nextLng);
    setError(null);
    setAccuracyM(null);
    const lat = Number(nextLat);
    const lng = Number(nextLng);
    const ok = nextLat.trim() !== '' && nextLng.trim() !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    setPin(ok ? { lat, lng } : null);
  };

  const linkChanged = (text: string) => {
    setLink(text);
    setError(null);
    if (!text.trim()) return;
    const found = pinFromText(text);
    if (found) showPin(found);
  };

  const save = async () => {
    if (link.trim() && !pinFromText(link)) {
      setError(t('errors.noPlaceInLink'));
      return;
    }
    // Half a pair, or a number that is not a place: said here, next to the boxes it is about.
    if ((latText.trim() || lngText.trim()) && !pin) {
      setError(t('errors.badCoords'));
      return;
    }
    // Said here rather than let the API say it: the same two numbers are already on the screen as a hint.
    if (radiusText.trim() === '' || !Number.isInteger(radius) || radius < RADIUS_MIN_M || radius > RADIUS_MAX_M) {
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

  /** Opens wherever the phone sends maps links — Google Maps' documented search URL, no key, no embed. */
  const mapsUrl = (p: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

  /*
   * Ordered by what an owner came to do, so the five things that matter sit above the fold at 344x882:
   * the two switches together (who may mark in: staff, and the front desk), where the branch is, how close counts. The page header
   * already names the screen and the branch, so there is no card title repeating them, and the maps-link
   * route is folded away — the button above it is the way almost everyone sets a pin.
   */
  return (
    <>
    <div className="card ci-settings">
      <div className="card-body">
        <div className="ci-switch-row ci-switch-first">
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

        <div className="ci-switch-row ci-switch-second">
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

        <div className="field">
          <span className="field-label">{t('pinLabel')}</span>
          {/* The status, its numbers (so a pin can be read back and checked), and the one way to see it on a map. */}
          <p className={`ci-pin ${pin ? 'is-set' : ''}`} aria-live="polite">
            <span>{pin ? t('pinSaved') : t('pinNotSet')}</span>
            {pin ? (
              <a className="ci-map" href={mapsUrl(pin)} target="_blank" rel="noreferrer">
                {t('seeOnMap')}
              </a>
            ) : null}
          </p>
          {pin ? (
            <p className="ci-coords" aria-label={t('coordsLabel')}>
              <span>{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</span>
              {accuracyM != null ? <span className="ci-accuracy">{t('accuracy', { m: accuracyM })}</span> : null}
            </p>
          ) : null}
          <div className="ci-pin-actions">
            <button type="button" className="btn ci-here" disabled={locating || busy || !writable} onClick={() => void useHere()}>
              {locating ? t('finding') : t('useHere')}
            </button>
            {pin ? (
              <button type="button" className="btn-ghost" disabled={busy || !writable} onClick={() => { setPin(null); setEnabled(false); setLink(''); setLatText(''); setLngText(''); setAccuracyM(null); }}>
                {t('clearPin')}
              </button>
            ) : null}
          </div>
          <span className="field-hint">{t('useHereHint')}</span>

          <details className="ci-link">
            <summary>
              <span>{t('manualLabel')}</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>
            <div className="ci-coord-grid">
              <label>
                <span className="ci-mini-label">{t('latLabel')}</span>
                <input type="text" inputMode="decimal" autoComplete="off" placeholder="12.971599" value={latText} disabled={busy || !writable} onChange={(e) => coordsChanged(e.target.value.replace(/[^\d.\-]/g, ''), lngText)} />
              </label>
              <label>
                <span className="ci-mini-label">{t('lngLabel')}</span>
                <input type="text" inputMode="decimal" autoComplete="off" placeholder="77.594566" value={lngText} disabled={busy || !writable} onChange={(e) => coordsChanged(latText, e.target.value.replace(/[^\d.\-]/g, ''))} />
              </label>
            </div>
            <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={t('linkLabel')} value={link} placeholder={t('linkPlaceholder')} disabled={busy || !writable} onChange={(e) => linkChanged(e.target.value)} />
            <span className="field-hint">{t('linkHint')}</span>
          </details>
        </div>

        <label className="field ci-radius-field">
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
