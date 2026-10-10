'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, type AttendanceRow } from '../../lib/api';
import { getFix, metresLabel } from '../../lib/geo-fix';
import { useMayUse, useSelfCheckIn } from '../SessionProvider';
import { IconClipboardCheck } from '../icons';

/**
 * Jira GRW-563 — "I'm in" / "I'm out" on a stylist's own Home.
 *
 * One button, 56px, and nothing to type. Tapping it asks the phone where it is (up to ten seconds), sends
 * whatever it said — or nothing — and the API decides: inside the branch's fence the day counts by itself;
 * otherwise it is saved and waits for the owner, and this card says so. Nobody is ever refused (BR-01).
 *
 * Drawn only when the session says her branch offers it (`selfCheckIn`) and the shared rule says a stylist
 * may (`attendance.self`), so an owner never sees a button for a register they mark from the other side.
 */
export function CheckInCard({ today, timezone }: { today: AttendanceRow | null; timezone: string }) {
  const t = useTranslations('attendance.checkIn');
  const router = useRouter();
  const offered = useSelfCheckIn();
  const may = useMayUse('attendance.self');
  const [busy, setBusy] = useState<'in' | 'out' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justPlaced, setJustPlaced] = useState<boolean | null>(null);
  if (!offered || !may) return null;

  const inAt = today?.inAt ?? null;
  const outAt = today?.outAt ?? null;
  const approval = today?.approval ?? null;
  const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

  const mark = async (kind: 'in' | 'out') => {
    setBusy(kind);
    setError(null);
    try {
      const fix = await getFix();
      const result = kind === 'in' ? await api.selfCheckIn(fix) : await api.selfCheckOut(fix);
      setJustPlaced(result.placed);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(null);
    }
  };

  /** The one line under the button: what the day says right now. */
  let state: { tone: 'green' | 'amber' | 'rose' | 'slate'; text: string } | null = null;
  if (today?.status === 'absent' && approval === 'rejected') {
    state = { tone: 'rose', text: t('rejected', { reason: t(`reasons.${today.rejectReason ?? 'other'}`) }) };
  } else if (inAt && approval === 'pending') {
    state = { tone: 'amber', text: t('waiting', { time: time(outAt ?? inAt) }) };
  } else if (inAt && approval === 'approved') {
    state = { tone: 'green', text: t('approved', { time: time(inAt) }) };
  } else if (inAt) {
    state = { tone: 'green', text: outAt ? t('inAndOut', { in: time(inAt), out: time(outAt) }) : t('markedIn', { time: time(inAt) }) };
  }

  return (
    <section className="hm-card ci-card" aria-labelledby="ci-title">
      <div className="hm-card-head">
        <h2 id="ci-title">
          <IconClipboardCheck /> {t('title')}
        </h2>
      </div>
      {/* A day the owner said no to is theirs to correct: no second "I'm in". */}
      {!inAt && approval !== 'rejected' ? (
        <button type="button" className="ci-button ci-in" disabled={busy !== null} onClick={() => void mark('in')}>
          {busy === 'in' ? t('finding') : t('imIn')}
        </button>
      ) : !outAt ? (
        <button type="button" className="ci-button ci-out" disabled={busy !== null} onClick={() => void mark('out')}>
          {busy === 'out' ? t('finding') : t('imOut')}
        </button>
      ) : null}
      {state ? <p className={`ci-state ci-state-${state.tone}`}>{state.text}</p> : null}
      {justPlaced === false && approval === 'pending' ? <p className="ci-hint">{t('noPlaceHint')}</p> : null}
      {today?.inDistanceM != null && approval !== 'pending' ? <p className="ci-hint">{t('distance', { m: metresLabel(today.inDistanceM) ?? '' })}</p> : null}
      {error ? (
        <p role="alert" className="ci-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
