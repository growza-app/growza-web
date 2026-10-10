'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type BranchSettings } from '../../lib/api';
import { getFix, pinFromText } from '../../lib/geo-fix';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { useCloseAfterSave } from '../../lib/close-after-save';
import { useWritable } from '../../components/SessionProvider';

/** 50 m is a shop; 500 m is a street. The API refuses anything outside, so the choices stop there too. */
const RADIUS_CHOICES = [50, 100, 150, 200, 300, 500];

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
  const [radius, setRadius] = useState(branch.geoRadiusM ?? 100);
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

  return (
    <div className="card ci-settings">
      <div className="card-head">{branchCount > 1 && branchName ? t('titleBranch', { name: branchName }) : t('title')}</div>
      <div className="card-body">
        <p className="field-hint ci-settings-intro">{t('intro')}</p>

        <div className="field">
          <span className="field-label">{t('pinLabel')}</span>
          <p className={`ci-pin ${pin ? 'is-set' : ''}`} aria-live="polite">
            {pin ? t('pinSet', { lat: fmt(pin.lat), lng: fmt(pin.lng) }) : t('pinNotSet')}
          </p>
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
          <select value={radius} disabled={busy || !writable} onChange={(e) => setRadius(Number(e.target.value))}>
            {RADIUS_CHOICES.map((m) => (
              <option key={m} value={m}>
                {t('radiusOption', { m })}
              </option>
            ))}
          </select>
          <span className="field-hint">{t('radiusHint')}</span>
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
        <SettingsSaveBar busy={busy} saved={saved} onSave={() => void save()} saveLabel={t('save')} savingLabel={t('saving')} savedLabel={t('savedLabel')} />
      </div>
    </div>
  );
}
