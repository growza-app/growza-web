'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, formatTime, type Appointment, type Service } from '../lib/api';
import { isValidAmount, minorToRupees, toMinor } from '../lib/checkout-lines';
import { LargeAmountDeclined, useLargeAmountGuard } from './LargeAmountConfirm';
import { useDialog } from '../../shared/a11y/useDialog';

const REASON_MAX = 300;

/**
 * The owner fixes a finished booking: a wrong amount, a wrong service.
 *
 * Corrected in place, so the client keeps their history and the day's takings read the right figure. Each change is
 * kept in the audit log with before and after; the reason is optional. There is no time limit.
 *
 * Only the owner reaches this: the item that opens it follows `booking.correct`, and the API refuses anyone else.
 */
export function CorrectBookingSheet({
  appointment,
  legs,
  services,
  timezone,
  onClose,
}: {
  appointment: Appointment;
  /** Every finished service of the visit, this one included. */
  legs: Appointment[];
  services: Service[];
  timezone: string;
  onClose: () => void;
}) {
  const t = useTranslations('chrome.correct');
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose });
  const { guard, dialog } = useLargeAmountGuard();

  const [rows, setRows] = useState(() =>
    legs.map((leg) => ({
      id: leg.id,
      serviceId: leg.serviceId,
      amount: minorToRupees(leg.paidAmountMinor ?? leg.priceMinor),
    })),
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Jira GRW-648 — reward points the save moved, held so the sheet can say so before it closes.
   *
   * `null` is every correction that moved none, which is nearly all of them, and those close as they always
   * did. A correction that DID move points is the one case worth a tap: the owner changed an amount and a
   * client's balance changed with it, which nothing else on this screen would ever tell them.
   */
  const [pointsMoved, setPointsMoved] = useState<number | null>(null);

  /** The branch's own menu, plus whatever the booking already has — a retired service must stay selectable. */
  const optionsFor = (leg: Appointment): Array<{ id: string; name: string }> => {
    const menu = services.filter((s) => s.id === leg.serviceId || !appointment.locationId || s.locationId === appointment.locationId);
    // A service retired since the visit is not on the menu any more, but the booking still has it.
    return menu.some((s) => s.id === leg.serviceId) ? menu : [{ id: leg.serviceId ?? '', name: leg.serviceName }, ...menu];
  };

  const patch = (id: string, change: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const changed = rows.filter((row) => {
    const leg = legs.find((l) => l.id === row.id)!;
    return row.serviceId !== leg.serviceId || toMinor(row.amount) !== Number(leg.paidAmountMinor ?? leg.priceMinor ?? 0);
  });
  const valid = rows.every((r) => isValidAmount(r.amount));

  const save = async () => {
    if (!valid) {
      setError(t('amountInvalid'));
      return;
    }
    if (changed.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await guard((confirmed) =>
        api.correctBooking(appointment.id, {
          legs: changed.map((row) => {
            const leg = legs.find((l) => l.id === row.id)!;
            return {
              appointmentId: row.id,
              paidAmountMinor: toMinor(row.amount),
              ...(row.serviceId && row.serviceId !== leg.serviceId ? { serviceId: row.serviceId } : {}),
            };
          }),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(confirmed ? { confirmLargeAmount: true } : {}),
        }),
      );
      router.refresh();
      if (saved.pointsMoved !== 0) {
        setBusy(false);
        setPointsMoved(saved.pointsMoved);
        return;
      }
      onClose();
    } catch (err) {
      setBusy(false);
      if (err instanceof LargeAmountDeclined) return;
      setError(t('saveFailed'));
    }
  };

  if (pointsMoved !== null) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
          ref={sheetRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-head">
            {/* The middle column is centred between two, and there is nothing to cancel any more. */}
            <span />
            <span className="sheet-head-title">{t('title')}</span>
            <button type="button" className="sheet-head-save" onClick={onClose}>
              {t('done')}
            </button>
          </div>
          <div className="sheet-body">
            <div className="sheet-group">
              <div className="sheet-row">
                <span className="sheet-row-label">{t('pointsTitle')}</span>
                <span className="sheet-row-value" role="status">
                  {pointsMoved < 0 ? t('pointsTakenBack', { n: -pointsMoved }) : t('pointsAdded', { n: pointsMoved })}
                </span>
              </div>
            </div>
            <div className="sheet-foot">{t('pointsWhy')}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
          ref={sheetRef}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-head">
            <button type="button" className="sheet-head-cancel" onClick={onClose}>
              {t('cancel')}
            </button>
            <span className="sheet-head-title">{t('title')}</span>
            <button type="button" className="sheet-head-save" disabled={busy} onClick={save}>
              {busy ? t('saving') : t('save')}
            </button>
          </div>

          <div className="sheet-body">
            <p className="sheet-foot">
              {appointment.customerName ?? ''} · {formatTime(appointment.startAt, timezone)}
            </p>

            {rows.map((row, i) => {
              const leg = legs[i]!;
              return (
                <div className="sheet-group" key={row.id}>
                  <div className="sheet-row">
                    <label className="sheet-row-label" htmlFor={`fix-svc-${row.id}`}>
                      {t('service')}
                    </label>
                    <div className="sheet-row-value">
                      <select
                        id={`fix-svc-${row.id}`}
                        value={row.serviceId ?? ''}
                        disabled={Boolean(leg.offerTitle)}
                        // What was paid stays as it was: changing the service is not changing the money.
                        onChange={(e) => patch(row.id, { serviceId: e.target.value })}
                      >
                        {optionsFor(leg).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="sheet-row">
                    <label className="sheet-row-label" htmlFor={`fix-amt-${row.id}`}>
                      {t('amount')}
                    </label>
                    <div className="sheet-row-value">
                      <input
                        id={`fix-amt-${row.id}`}
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => patch(row.id, { amount: e.target.value })}
                        className={isValidAmount(row.amount) ? undefined : 'field-invalid'}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="sheet-group">
              <div className="sheet-row">
                <label className="sheet-row-label" htmlFor="fix-reason">
                  {t('reason')}
                </label>
                <div className="sheet-row-value">
                  <input
                    id="fix-reason"
                    type="text"
                    value={reason}
                    maxLength={REASON_MAX}
                    placeholder={t('reasonPlaceholder')}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {error ? (
              <div role="alert" className="sheet-foot sheet-foot-error">
                {error}
              </div>
            ) : (
              <div className="sheet-foot">{legs.some((l) => l.offerTitle) ? t('notePackage') : t('note')}</div>
            )}
          </div>
        </div>
      </div>
      {dialog}
    </>
  );
}
