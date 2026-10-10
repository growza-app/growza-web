'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, ApiError, type BranchSettings } from '../../lib/api';
import { getFix, isShortMapsLink, mapsHref, pinFromText } from '../../lib/geo-fix';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { useCloseAfterSave } from '../../lib/close-after-save';
import { useWritable } from '../../components/SessionProvider';

/** 50 m is a shop; 500 m is a street. The API refuses anything outside, so the choices stop there too. */
const RADIUS_CHOICES = [50, 100, 150, 200, 300, 500];

/**
 * Jira GRW-563 — where the branch is, how close counts, and who approves the rest.
 *
 * No map of our own. The owner stands in the salon and taps "Use where I am now", or pastes the numbers
 * Google Maps copies from a long press; the pin is shown back as plain numbers with a link to go and look
 * at it, which is all a fence needs. Plain words throughout: an owner may not know what a radius is, and
 * does know what "how close counts" means.
 *
 * Two things this screen owes the owner, learned the hard way (review, 2026-10-11):
 *
 *   - the phone's own accuracy. `getFix` returns it and this screen used to drop it, so an indoor fix good
 *     to ±800m showed as a green "Set" and every later check-in quietly landed pending.
 *   - what a pasted link has to be. A phone's Share button gives a short link with no place in it, which
 *     is exactly what the old hint asked for; `isShortMapsLink` names that case instead of answering
 *     "Could not find a place in that link."
 */
export function CheckInForm({ branch, branchName, branchCount }: { branch: BranchSettings; branchName: string | null; branchCount: number }) {
  const t = useTranslations('settingsCheckIn');
  const writable = useWritable();
  const closeForm = useCloseAfterSave('/settings');
  /** `accuracyM` exists only for a pin this phone just took; one that was stored or pasted has none to show. */
  const [pin, setPin] = useState<{ lat: number; lng: number; accuracyM?: number | null } | null>(
    branch.geoLat != null && branch.geoLng != null ? { lat: branch.geoLat, lng: branch.geoLng } : null,
  );
  const [link, setLink] = useState('');
  const [radius, setRadius] = useState(branch.geoRadiusM ?? 100);
  const [enabled, setEnabled] = useState(branch.geoEnabled ?? false);
  const [deskApproves, setDeskApproves] = useState(branch.geoDeskApproves ?? false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * A phone only sure of itself to 800m has not found the salon, it has found the neighbourhood. Saved as
   * it is, the fence sits on a guess and every stylist's "I'm in" lands outside it as pending, with nothing
   * on any screen saying why. Measured against the radius the owner actually picked, so changing "How close
   * counts" re-answers the question.
   */
  const rough = pin?.accuracyM != null && pin.accuracyM > radius ? Math.round(pin.accuracyM) : null;

  const useHere = async () => {
    setLocating(true);
    setError(null);
    const fix = await getFix();
    setLocating(false);
    if (!fix) {
      setError(t('errors.noFix'));
      return;
    }
    setPin({ lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM });
    setLink('');
  };

  const linkChanged = (text: string) => {
    setLink(text);
    const found = text.trim() ? pinFromText(text) : null;
    if (found) setPin(found);
    // Named as it is typed: a short link is the wrong KIND of link, and saying so on Save reads as "try again".
    setError(!found && isShortMapsLink(text) ? t('errors.shortLink') : null);
  };

  const save = async () => {
    /*
     * Only when there is nothing else to go on. The link box is the ALTERNATIVE to "Use where I am now"
     * ("Or paste…"), so leftover text in it used to refuse a save of a pin that was already right: the
     * owner taps Save, is told about a link they are not relying on, and nothing is written.
     */
    if (!pin && link.trim()) {
      setError(isShortMapsLink(link) ? t('errors.shortLink') : t('errors.noPlaceInLink'));
      return;
    }
    if (enabled && !pin) {
      setError(t('errors.pinFirst'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateBranch(branch.id, { geoPin: pin, geoRadiusM: radius, geoEnabled: enabled, geoDeskApproves: deskApproves });
      closeForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => n.toFixed(5);

  return (
    <>
      <div className="card ci-settings">
        <div className="card-head">{branchCount > 1 && branchName ? t('titleBranch', { name: branchName }) : t('title')}</div>
        <div className="card-body">
          <p className="field-hint ci-settings-intro">{t('intro')}</p>

          <div className="field">
            <span className="field-label">{t('pinLabel')}</span>
            <p className={`ci-pin ${pin ? 'is-set' : ''}`} aria-live="polite">
              {pin ? t('pinSet', { lat: fmt(pin.lat), lng: fmt(pin.lng) }) : t('pinNotSet')}
            </p>
            {pin ? (
              <a className="ci-pin-check" href={mapsHref(pin)} target="_blank" rel="noopener noreferrer">
                {t('seeOnMap')}
              </a>
            ) : null}
            {rough ? (
              <p className="ci-pin-rough" aria-live="polite">
                {t('pinRough', { m: rough, radius })}
              </p>
            ) : null}
            <div className="ci-pin-actions">
              <button type="button" className="btn" disabled={locating || busy || !writable} onClick={() => void useHere()}>
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
            {/* `text`, not `url`: what this field mostly takes is "12.97123, 77.59456", and a url keyboard
                offers ".com" to someone pasting numbers. */}
            <input type="text" value={link} placeholder={t('linkPlaceholder')} disabled={busy || !writable} onChange={(e) => linkChanged(e.target.value)} />
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
        </div>
      </div>
      {/*
        Outside the card, where every other settings form puts it. Inside, `.card { overflow: hidden }`
        (05-cards.css) made the CARD the sticky bar's scrolling box, and a card does not scroll — so
        `position: sticky` never engaged and Save just sat at the end of the content. At 344×882 that put
        it at y 795–867 against a tab bar starting at 807, and `elementFromPoint` on the button returned
        the Home link: a thumb aimed at Save went Home.
      */}
      <SettingsSaveBar busy={busy} onSave={() => void save()} saveLabel={t('save')} savingLabel={t('saving')} />
    </>
  );
}
