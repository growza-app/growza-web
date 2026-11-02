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
/** Evening and night, which is when a day ends anywhere this is sold. Earlier hours are not a closing time. */
const HOURS = [18, 19, 20, 21, 22, 23, 0, 1] as const;

/** "9 pm", "midnight", "1 am" — a clock as it is spoken, not a 24-hour number to decode. */
function hourLabel(h: number): string {
  if (h === 0) return 'Midnight';
  if (h === 12) return 'Noon';
  return h < 12 ? `${h} am` : `${h === 12 ? 12 : h - 12} pm`;
}

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
  /**
   * The device button is mid-flight.
   *
   * Review 2026-10-24 — its only `disabled` condition was `!writable`, and unlike a switch it sets no `saving`.
   * Where permission is already granted there is no prompt, so the whole action is one POST: on a slow
   * connection a second tap landed before the first returned, and the count below counted both.
   */
  const [onDevice, setOnDevice] = useState(false);
  /**
   * The hour this business wants its closing summary, in its own timezone.
   *
   * `null` is a real answer and not a missing one: it means "whatever the platform sends at", which is what
   * every business that has never thought about it has. Shown beside the switch it belongs to rather than in
   * Booking settings, because an hour a message arrives is a fact about the message.
   */
  const [summaryHour, setSummaryHour] = useState<number | null | 'loading'>('loading');
  const [hourSaved, setHourSaved] = useState(false);

  useEffect(() => {
    let live = true;
    void api
      .settings()
      .then((cfg) => live && setSummaryHour(cfg.booking?.daySummaryHour ?? null))
      // A screen that cannot read the hour still works for the switches above it: the control hides itself.
      .catch(() => live && setSummaryHour('loading'));
  }, []);

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
   * Turning a switch on registers this device first — every time, not only the first time.
   *
   * The permission prompt comes BEFORE the preference is written, so a refused prompt leaves nothing saved: the
   * switch stays off and the screen says why, rather than claiming an alert is on that can never arrive.
   *
   * And the POST is made on every enable, not only when this browser has no subscription yet (review
   * 2026-10-24). `getSubscription()` is per ORIGIN and knows nothing about who is signed in: on the shop
   * tablet, where one owner signs out and another signs in, the second person's browser hands back the FIRST
   * person's subscription. Skipping the POST then left the row owned by somebody who had gone home — their
   * phone kept buzzing, and the person actually standing there got nothing and had no way to find out. The POST
   * is an upsert on the endpoint, so making it every time simply moves the device to whoever is signed in.
   */
  const toggle = useCallback(
    async (kind: AlertKind, next: boolean) => {
      setError(null);
      setSaving(kind);
      try {
        if (next) {
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
    [blocker, t, vapidPublicKey],
  );

  /**
   * Let this phone receive, without changing a single switch.
   *
   * Needed once the evening summary is on by default (owner, 2026-10-24). Before that, a switch was always the
   * way in: you turned one on, and registering the device came with it. Now a fresh owner arrives to find
   * "Day summary" already on and this phone not registered — a true statement with nothing to do about it,
   * which is the dead end the blocker messages exist to avoid.
   */
  const useThisPhone = useCallback(async () => {
    setError(null);
    setOnDevice(true);
    try {
      const result = await subscribeThisDevice(vapidPublicKey ?? '');
      if (typeof result === 'string') {
        setBlocker(result === 'unsupported' && blocker === null ? null : result);
        if (result === 'blocked') setError(t('blocked'));
        return;
      }
      await api.saveAlertDevice(result);
      setThisDevice(true);
      /*
       * Re-read the count rather than adding one to it (review 2026-10-24).
       *
       * The POST is an upsert on the endpoint, so it does not always create a row. This browser may already
       * have a subscription the mount effect missed — `currentDevice()` asks `getRegistration()`, which answers
       * `undefined` while the service worker is still installing, whereas `subscribeThisDevice` waits on
       * `.ready` and finds it. A `+ 1` there claimed a second phone that does not exist, and the line then read
       * "1 other device also gets them."
       *
       * A failed re-read is left alone rather than guessed at: the sentence that matters comes from
       * `thisDevice`, which is already right, and `otherDevices` is detail that the next load will correct.
       */
      const fresh = await api.alertPrefs().catch(() => null);
      if (fresh) setPrefs(fresh);
    } catch {
      setError(t('saveFailed'));
    } finally {
      setOnDevice(false);
    }
  }, [blocker, t, vapidPublicKey]);

  /** Stop this phone receiving, without touching what the person asked for — their choices outlive the device. */
  const forgetDevice = useCallback(async () => {
    setError(null);
    setOnDevice(true);
    try {
      const device = await unsubscribeThisDevice();
      if (device) await api.forgetAlertDevice(device.endpoint);
      setThisDevice(false);
      setPrefs((current) => (current ? { ...current, devices: Math.max(current.devices - 1, 0) } : current));
    } catch {
      setError(t('saveFailed'));
    } finally {
      setOnDevice(false);
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

        {/*
          The hour the closing summary arrives. Only beside a summary that is actually switched on: an hour for
          a message you do not get is a control that does nothing, which is the shape this repo keeps finding.
        */}
        {prefs?.prefs.find((p) => p.kind === 'day.summary')?.enabled && summaryHour !== 'loading' ? (
          <div className="al-row al-summary-hour">
            <div>
              <label className="al-row-title" htmlFor="al-summary-hour">
                {t('summaryHourTitle')}
              </label>
              <span className="field-hint">{t('summaryHourHint')}</span>
            </div>
            <select
              id="al-summary-hour"
              value={summaryHour === null ? '' : String(summaryHour)}
              disabled={!writable}
              onChange={(e) => {
                const next = e.target.value === '' ? null : Number(e.target.value);
                setSummaryHour(next);
                setHourSaved(false);
                setError(null);
                void api
                  .updateBookingRules(next === null ? {} : { daySummaryHour: next })
                  .then(() => setHourSaved(true))
                  .catch(() => setError(t('saveFailed')));
              }}
            >
              <option value="">{t('summaryHourDefault')}</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
            {hourSaved ? <span className="field-hint">{t('summaryHourSaved')}</span> : null}
          </div>
        ) : null}

        {error ? (
          <p className="al-error" role="alert">
            {error}
          </p>
        ) : null}

        {/*
          The device line — once something is on, OR while this phone is registered.

          `anyOn` alone was right while a device could only come into being by turning a switch on. It cannot
          any more (review 2026-10-24): "Get them on this phone" registers one on its own, so somebody could
          register this phone, switch the summary off, and watch the only "Stop on this phone" button in the
          whole app disappear — leaving a live subscription and a `push_subscription` row with nothing anywhere
          that could remove them. The second clause is what keeps the way out open.

          Still hidden for the common case it was written for: nothing on and no device here means there is
          nothing to say, and a "0 devices" line on an untouched screen reads like a fault.
        */}
        {anyOn || thisDevice ? (
          <div className="al-devices">
            <p className="field-hint" aria-live="polite">
              {thisDevice ? t('deviceOn') : t('deviceOff')}
              {prefs && prefs.devices > 1 ? ` ${t('otherDevices', { count: prefs.devices - 1 })}` : ''}
            </p>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={thisDevice ? forgetDevice : useThisPhone}
              disabled={!writable || onDevice}
            >
              {thisDevice ? t('stopOnThisPhone') : t('useThisPhone')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
