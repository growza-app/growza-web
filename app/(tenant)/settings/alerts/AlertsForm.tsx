'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { api, type AlertPrefs } from '../../lib/api';
import { useWritable } from '../../components/SessionProvider';
import {
  ALERT_KINDS,
  ALERT_MESSAGE_KEY,
  currentDevice,
  pushBlocker,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type AlertKind,
  type PushBlocker,
} from '../../lib/push-alerts';

/**
 * Jira GRW-647 — four switches, and nothing happens until one of them is on.
 *
 * The order of operations is the whole design. Nothing asks the browser for permission, and nothing registers a
 * device, until somebody turns on their FIRST switch — so an owner who never opens this screen pays nothing for
 * the feature, and one who opens it and leaves leaves no row behind either.
 *
 * Each switch saves on its own, with no Save bar. A notification preference is a decision you make and walk
 * away from; a bar that has to be pressed afterwards is how somebody ends up thinking they turned something on
 * when they did not.
 */
export function AlertsForm({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useTranslations('settingsAlerts');
  const writable = useWritable();

  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** Which kind is mid-save, so one slow request disables one row rather than the screen. */
  const [saving, setSaving] = useState<AlertKind | null>(null);
  const [blocker, setBlocker] = useState<PushBlocker | null | 'checking'>('checking');
  const [thisDevice, setThisDevice] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      // `pushBlocker` reads `navigator` and `window.matchMedia`, so it runs in an effect, not in render —
      // on the server there is no window, and a mismatch between the two would be a hydration error.
      const found = pushBlocker(Boolean(vapidPublicKey));
      const device = await currentDevice();
      if (!live) return;
      setBlocker(found);
      setThisDevice(device !== null);
    })();
    return () => {
      live = false;
    };
  }, [vapidPublicKey]);

  useEffect(() => {
    let live = true;
    api
      .alertPrefs()
      .then((answer) => live && setPrefs(answer))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const anyOn = (prefs?.prefs ?? []).some((p) => p.enabled);

  /**
   * Turning a switch on may have to subscribe this device first.
   *
   * The permission prompt comes BEFORE the preference is written, so a refused prompt leaves nothing saved —
   * the switch stays off and the screen says why, rather than claiming an alert is on that can never arrive.
   */
  const toggle = useCallback(
    async (kind: AlertKind, next: boolean) => {
      setError(null);
      setSaving(kind);
      try {
        if (next && !thisDevice) {
          const result = await subscribeThisDevice(vapidPublicKey ?? '');
          if (typeof result === 'string') {
            setBlocker(result === 'unsupported' && blocker === null ? null : result);
            // `unsupported` coming back from a dismissed prompt is not an error worth a sentence: the browser
            // will ask again next time, and the switch simply stayed off.
            if (result === 'blocked') setError(t('blocked'));
            return;
          }
          await api.saveAlertDevice(result);
          setThisDevice(true);
        }

        await api.setAlertPref(kind, next);
        setPrefs((current) =>
          current ? { ...current, prefs: current.prefs.map((p) => (p.kind === kind ? { ...p, enabled: next } : p)) } : current,
        );
      } catch {
        setError(t('saveFailed'));
      } finally {
        setSaving(null);
      }
    },
    [blocker, t, thisDevice, vapidPublicKey],
  );

  /** Stop this phone receiving, without touching what the person asked for — their choices outlive the device. */
  const forgetDevice = useCallback(async () => {
    setError(null);
    try {
      const device = await unsubscribeThisDevice();
      if (device) await api.forgetAlertDevice(device.endpoint);
      setThisDevice(false);
      setPrefs((current) => (current ? { ...current, devices: Math.max(current.devices - 1, 0) } : current));
    } catch {
      setError(t('saveFailed'));
    }
  }, [t]);

  if (loadFailed) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="field-hint">{t('loadFailed')}</p>
        </div>
      </div>
    );
  }

  // A real blocker replaces the switches rather than disabling them: four greyed-out rows invite somebody to
  // keep tapping, and the one sentence that matters is why they cannot.
  if (blocker && blocker !== 'checking') {
    return (
      <div className="card">
        <div className="card-body">
          <h2 className="al-blocked-title">{t('cannot')}</h2>
          <p className="field-hint">{t(`blockers.${blocker}`)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card al-alerts">
      <div className="card-body">
        <p className="field-hint al-intro">{t('intro')}</p>

        <ul className="al-list">
          {ALERT_KINDS.map((kind) => {
            const pref = prefs?.prefs.find((p) => p.kind === kind);
            const id = `al-${kind.replace('.', '-')}`;
            return (
              <li className="al-row" key={kind}>
                <label className="switch">
                  <input
                    type="checkbox"
                    aria-labelledby={`${id}-label`}
                    // Unchecked while loading rather than indeterminate: the answer is "off" for almost
                    // everyone, and a third visual state for the half-second before the answer arrives is
                    // more confusing than the common case shown early.
                    checked={pref?.enabled ?? false}
                    disabled={!prefs || saving !== null || !writable || blocker === 'checking'}
                    onChange={() => toggle(kind, !(pref?.enabled ?? false))}
                  />
                  <span className="switch-track">
                    <span className="switch-thumb" />
                  </span>
                </label>
                <div>
                  <div id={`${id}-label`} className="al-row-title">
                    {t(`kinds.${ALERT_MESSAGE_KEY[kind]}.title`)}
                  </div>
                  <span className="field-hint">{t(`kinds.${ALERT_MESSAGE_KEY[kind]}.hint`)}</span>
                </div>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p className="al-error" role="alert">
            {error}
          </p>
        ) : null}

        {/*
          The device line, and only once something is on. Before that there is no device and nothing to say,
          and a "0 devices" line on a screen where nothing has been switched on reads like a fault.
        */}
        {anyOn ? (
          <div className="al-devices">
            <p className="field-hint" aria-live="polite">
              {thisDevice ? t('deviceOn') : t('deviceOff')}
              {prefs && prefs.devices > 1 ? ` ${t('otherDevices', { count: prefs.devices - 1 })}` : ''}
            </p>
            {thisDevice ? (
              <button type="button" className="btn btn-quiet" onClick={forgetDevice} disabled={!writable}>
                {t('stopOnThisPhone')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
