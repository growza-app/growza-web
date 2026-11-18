'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type SettingsSummary } from '../../lib/api';
import { bitmapDataUrl } from '../../lib/print/bitmap';
import { logoBitmap } from '../../lib/print/picture';
import { LOGO_ACCEPT, prepareLogo } from '../../lib/logo-file';
import { forgetBusinessLogo } from '../../lib/business-logo';
import { useAreas, useSession, useWritable } from '../../components/SessionProvider';

/**
 * Jira GRW-728 — the business logo: upload, take off, and see how it will print on the bill.
 *
 * The owner alone changes it (BR-01); a manager sees the logo and its print preview with no buttons. A business whose
 * till prints bills (a shop, a restaurant) is shown the logo as a 58mm and an 80mm roll will print it — black dots
 * only, the very dots the printer is sent — because a pale or detailed logo that looks fine on screen can come out of
 * a thermal printer as a grey smudge, and the owner should find that out here, not on a guest's bill.
 */
export function LogoCard({ settings, onChange }: { settings: SettingsSummary; onChange: (next: SettingsSummary) => void }) {
  const t = useTranslations('settingsProfile');
  const session = useSession();
  const writable = useWritable();
  const prints = useAreas().shop;
  const mayChange = writable && (session?.role ?? 'owner') === 'owner';
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** undefined while the preview is being made; null when there is none to make. */
  const [rolls, setRolls] = useState<{ '58': string | null; '80': string | null } | null | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoUrl = settings.tenant.logoUrl;

  useEffect(() => {
    if (!prints || !logoUrl) {
      setRolls(null);
      return;
    }
    let live = true;
    setRolls(undefined);
    void (async () => {
      try {
        const { logo } = await api.businessLogo();
        if (!logo) {
          if (live) setRolls(null);
          return;
        }
        const [a, b] = await Promise.all([logoBitmap(logo, '58'), logoBitmap(logo, '80')]);
        if (live) setRolls({ '58': a ? bitmapDataUrl(a) : null, '80': b ? bitmapDataUrl(b) : null });
      } catch {
        if (live) setRolls(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [prints, logoUrl]);

  const onChosen = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy('upload');
    try {
      const ready = await prepareLogo(file);
      if (!ready.ok) {
        setError(ready.reason === 'type' ? t('logo.errorType') : t('logo.errorSize', { size: ready.size }));
        return;
      }
      onChange(await api.uploadBusinessLogo(ready.file));
      forgetBusinessLogo();
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('errors.logoFailed'));
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const remove = async () => {
    setError(null);
    setBusy('remove');
    try {
      onChange(await api.removeBusinessLogo());
      forgetBusinessLogo();
    } catch {
      setError(t('errors.logoRemoveFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card bp-card" aria-labelledby="bp-logo-title">
      <div className="bp-logo">
        <div className="bp-logo-preview">
          {logoUrl ? <img src={logoUrl} alt="" /> : settings.tenant.name.charAt(0).toUpperCase()}
        </div>
        <div className="bp-logo-text">
          <div className="bp-card-title" id="bp-logo-title">
            {t('logo.title')}
          </div>
          <div className="field-hint" id="bp-logo-hint">
            {mayChange ? t('logo.hint') : t('logo.ownerOnly')}
          </div>
        </div>
        {mayChange ? (
          <div className="bp-logo-actions">
            <button
              type="button"
              className="bp-logo-btn"
              disabled={busy !== null}
              aria-describedby={error ? 'bp-logo-error' : 'bp-logo-hint'}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy === 'upload' ? t('logo.uploading') : logoUrl ? t('logo.change') : t('logo.upload')}
            </button>
            {logoUrl ? (
              <button type="button" className="bp-logo-btn bp-logo-remove" disabled={busy !== null} onClick={() => void remove()}>
                {busy === 'remove' ? t('logo.removing') : t('logo.remove')}
              </button>
            ) : null}
            <input ref={fileInputRef} type="file" accept={LOGO_ACCEPT} hidden onChange={(e) => void onChosen(e.target.files?.[0])} />
          </div>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="field-error bp-logo-error" id="bp-logo-error">
          {error}
        </div>
      ) : null}
      {prints && logoUrl && rolls !== null ? (
        <div className="bp-logo-print">
          <div className="bp-logo-print-title">{t('logo.printTitle')}</div>
          <p className="field-hint">{t('logo.printHint')}</p>
          <div className="bp-logo-rolls">
            {(['58', '80'] as const).map((w) => (
              <figure key={w} className={`bp-logo-roll is-${w}`}>
                <div className="bp-logo-paper" aria-busy={rolls === undefined || undefined}>
                  {rolls === undefined ? (
                    <span className="bp-logo-paper-wait">{t('logo.printLoading')}</span>
                  ) : rolls[w] ? (
                    <img src={rolls[w]!} alt={t('logo.printAlt', { roll: w === '58' ? t('logo.roll58') : t('logo.roll80') })} />
                  ) : null}
                  <span className="bp-logo-paper-name" aria-hidden="true">
                    {settings.tenant.name}
                  </span>
                </div>
                <figcaption>{w === '58' ? t('logo.roll58') : t('logo.roll80')}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
