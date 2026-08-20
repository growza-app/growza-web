'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  formatMoney,
  formatTime,
  BookingConflictError,
  type Appointment,
  type PaymentMode,
  type Provider,
  type Service,
} from '../lib/api';
import { IconCheck, IconEdit, IconPhone, IconTrash, IconWallet } from './icons';

/** Digits only — `tel:` chokes on spaces and punctuation. Duplicated from BookingSheet.tsx rather than imported, to avoid a circular import (BookingSheet renders CheckoutSheet). */
function dialable(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

interface ExtraRow {
  serviceId: string;
  /** Raw rupee-string input value — parsed to minor units only on submit. */
  paidAmountMinor: string;
  schedulableId: string;
}

/** Rupees, as typed by staff, to minor currency units — the inverse of `formatMoney`'s `/100`. */
function toMinor(rupees: string): number {
  return Math.round(Number(rupees) * 100);
}

function isValidAmount(rupees: string): boolean {
  return rupees.trim() !== '' && Number.isFinite(toMinor(rupees)) && toMinor(rupees) >= 0;
}

/** `service.priceMinor` ("50000") to a plain rupee string for the input ("500") — the price auto-fills, staff only type when it's different. */
function minorToRupees(minor: string | null): string {
  if (!minor) return '';
  return String(Number(minor) / 100);
}

const PAYMENT_MODES: Array<{ value: PaymentMode; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'other', label: 'Other' },
];

/** One line in the services list — the original booking or an added extra, same look either way. */
function ServiceRow({
  name,
  amount,
  onAmountChange,
  providerId,
  providerName,
  providers,
  onProviderChange,
  editing,
  onToggleEdit,
  onRemove,
  disabled,
}: {
  name: string;
  amount: string;
  onAmountChange: (value: string) => void;
  providerId: string;
  providerName: string;
  providers: Provider[];
  onProviderChange: (providerId: string) => void;
  editing: boolean;
  onToggleEdit: () => void;
  onRemove?: () => void;
  disabled: boolean;
}) {
  return (
    <div className="checkout-service-row">
      <div className="checkout-service-avatar">{name.slice(0, 1).toUpperCase()}</div>
      <div className="checkout-service-info">
        <div className="checkout-service-name">{name}</div>
        {editing ? (
          <select
            className="checkout-provider-select"
            value={providerId}
            onChange={(e) => onProviderChange(e.target.value)}
            onBlur={onToggleEdit}
            disabled={disabled}
            autoFocus
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        ) : (
          <div className="checkout-service-sub">{providerName || 'No stylist set'}</div>
        )}
      </div>
      <div className="checkout-amount-field">
        <span>₹</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      <button type="button" className="checkout-icon-btn" aria-label="Change stylist" onClick={onToggleEdit} disabled={disabled}>
        <IconEdit />
      </button>
      {onRemove ? (
        <button
          type="button"
          className="checkout-icon-btn checkout-icon-btn-danger"
          aria-label="Remove this service"
          onClick={onRemove}
          disabled={disabled}
        >
          <IconTrash />
        </button>
      ) : (
        // Same footprint as the trash button, invisible — keeps the amount/edit/trash
        // column aligned across rows regardless of whether this row can be removed.
        <span className="checkout-icon-btn-spacer" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * Records what a checkout actually looked like: the amount paid for the
 * booked service, plus any extra services the customer took at the desk —
 * each becomes its own completed appointment, tied to this visit. No
 * receipt/payment collection here (parked until a payment provider is
 * integrated) — this is purely recording what happened, for accurate revenue.
 */
export function CheckoutSheet({
  appointment,
  services,
  providers,
  timezone,
  onClose,
}: {
  appointment: Appointment;
  services: Service[];
  providers: Provider[];
  timezone: string;
  onClose: () => void;
}) {
  const router = useRouter();
  // Pre-filled from the booked service's list price and its own provider —
  // the common case (paid exactly what's listed, same stylist) needs zero
  // typing. Staff only change what's actually different.
  const [amount, setAmount] = useState(() => minorToRupees(appointment.priceMinor));
  const [providerId, setProviderId] = useState(appointment.providerId ?? '');
  // The customer changed their mind at the desk and never got the originally
  // booked service at all — it gets cancelled (not completed) on save,
  // rather than assumed to have happened.
  const [originalRemoved, setOriginalRemoved] = useState(false);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [newServiceId, setNewServiceId] = useState('');
  const [editingRow, setEditingRow] = useState<'original' | number | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerName = (id: string) => providers.find((p) => p.id === id)?.displayName ?? '';

  const addExtra = () => {
    if (!newServiceId) return;
    const svc = services.find((s) => s.id === newServiceId);
    setExtras((xs) => [
      ...xs,
      { serviceId: newServiceId, paidAmountMinor: minorToRupees(svc?.priceMinor ?? null), schedulableId: providerId },
    ]);
    setNewServiceId('');
  };
  const removeExtra = (i: number) => setExtras((xs) => xs.filter((_, idx) => idx !== i));
  const updateExtra = (i: number, patch: Partial<ExtraRow>) =>
    setExtras((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const hasAnyService = !originalRemoved || extras.length > 0;
  const valid =
    hasAnyService &&
    (originalRemoved || isValidAmount(amount)) &&
    extras.every((x) => x.serviceId && isValidAmount(x.paidAmountMinor));
  const totalMinor =
    (!originalRemoved && isValidAmount(amount) ? toMinor(amount) : 0) +
    extras.reduce((sum, x) => sum + (isValidAmount(x.paidAmountMinor) ? toMinor(x.paidAmountMinor) : 0), 0);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.checkout(appointment.id, {
        paidAmountMinor: originalRemoved ? undefined : toMinor(amount),
        schedulableId: originalRemoved ? undefined : providerId || undefined,
        paymentMode,
        extraServices: extras.map((x) => ({
          serviceId: x.serviceId,
          paidAmountMinor: toMinor(x.paidAmountMinor),
          schedulableId: x.schedulableId || undefined,
        })),
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof BookingConflictError ? err.message : 'That did not save. Check the connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal checkout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-header">
          <div className="checkout-header-icon">
            <IconCheck />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>Mark as done</h3>
            <div className="checkout-header-name">
              {appointment.customerName ?? 'Unknown'}
              <a className="checkout-call-btn" href={`tel:${dialable(appointment.customerPhone)}`} aria-label="Call">
                <IconPhone />
              </a>
            </div>
            <div className="checkout-header-sub">
              {appointment.serviceName}
              {providerName(providerId) ? ` · ${providerName(providerId)}` : ''} · {formatTime(appointment.startAt, timezone)}
            </div>
          </div>
        </div>

        <div className="checkout-total-card">
          <div className="checkout-total-icon">
            <IconWallet />
          </div>
          <div>
            <div className="checkout-total-label">Total amount</div>
            <div className="checkout-total-value">{formatMoney(String(totalMinor))}</div>
          </div>
        </div>

        <div className="checkout-section-label">Services</div>

        {!originalRemoved && (
          <ServiceRow
            name={appointment.serviceName}
            amount={amount}
            onAmountChange={setAmount}
            providerId={providerId}
            providerName={providerName(providerId)}
            providers={providers}
            onProviderChange={setProviderId}
            editing={editingRow === 'original'}
            onToggleEdit={() => setEditingRow(editingRow === 'original' ? null : 'original')}
            onRemove={() => {
              setOriginalRemoved(true);
              if (editingRow === 'original') setEditingRow(null);
            }}
            disabled={busy}
          />
        )}

        {extras.map((x, i) => (
          <ServiceRow
            key={i}
            name={services.find((s) => s.id === x.serviceId)?.name ?? 'Service'}
            amount={x.paidAmountMinor}
            onAmountChange={(value) => updateExtra(i, { paidAmountMinor: value })}
            providerId={x.schedulableId}
            providerName={providerName(x.schedulableId)}
            providers={providers}
            onProviderChange={(id) => updateExtra(i, { schedulableId: id })}
            editing={editingRow === i}
            onToggleEdit={() => setEditingRow(editingRow === i ? null : i)}
            onRemove={() => removeExtra(i)}
            disabled={busy}
          />
        ))}

        {!hasAnyService && (
          <div className="muted" style={{ padding: '10px 0', fontSize: 13 }}>
            Add at least one service before saving.
          </div>
        )}

        <div className="checkout-add-row">
          <select value={newServiceId} onChange={(e) => setNewServiceId(e.target.value)} disabled={busy}>
            <option value="">Select a service</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={addExtra} disabled={busy || !newServiceId}>
            Add
          </button>
        </div>

        <div className="checkout-section-label">Payment method</div>
        <div className="payment-mode-row">
          {PAYMENT_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`payment-mode-btn ${paymentMode === m.value ? 'active' : ''}`}
              onClick={() => setPaymentMode(m.value)}
              disabled={busy}
            >
              {m.label}
            </button>
          ))}
        </div>

        {error && <div style={{ padding: '10px 0 0', fontSize: 13, color: '#b91c1c' }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn" onClick={submit} disabled={busy || !valid}>
            {busy ? 'Saving…' : 'Save and close'}
          </button>
        </div>
      </div>
    </div>
  );
}
