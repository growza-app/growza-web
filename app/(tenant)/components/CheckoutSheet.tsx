'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  formatMoney,
  formatTime,
  BookingConflictError,
  type Appointment,
  type Offer,
  type PaymentMode,
  type Provider,
  type Service,
} from '../lib/api';
import { summarizeServices } from '../lib/appointment-display';
import {
  amountsAreValid,
  buildCheckoutRequest,
  buildLines,
  comboSavingMinor,
  hasAnythingOnTheBill,
  isValidAmount,
  minorToRupees,
  totalMinor as billTotalMinor,
  type AddedCombo,
  type AddedService,
  type Line,
} from '../lib/checkout-lines';
import { IconCheck, IconEdit, IconPhone, IconTrash, IconWallet } from './icons';
import { useLabel } from './LabelsProvider';

/**
 * Digits only — `tel:` chokes on spaces and punctuation. Duplicated from
 * BookingSheet.tsx rather than imported, to avoid a circular import
 * (BookingSheet renders CheckoutSheet).
 *
 * GRW-199 — and the duplication cost something the moment a walk-in was allowed
 * without a phone: the copy here still took a plain `string`, so a no-number
 * client crashed the whole page with "Cannot read properties of null (reading
 * 'replace')" while the original had already been made safe. Two copies of a
 * function are two places to remember.
 */
function dialable(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^0-9]/g, '');
}

export const PAYMENT_MODES: Array<{ value: PaymentMode; label: string }> = [
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
  const providerWord = useLabel('provider', 'Staff member');
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
          <div className="checkout-service-sub">{providerName || `No ${providerWord.toLowerCase()} set`}</div>
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
      <button type="button" className="checkout-icon-btn" aria-label={`Change ${providerWord.toLowerCase()}`} onClick={onToggleEdit} disabled={disabled}>
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
 * Jira GRW-314 — a combo, as ONE row: its name and price, its services underneath. Taken off as a whole
 * (and put back as a whole), never a service at a time; the pencil opens who did each of its services.
 */
function ComboRow({
  title,
  legs,
  amount,
  onAmountChange,
  providers,
  providerName,
  onLegProvider,
  editing,
  onToggleEdit,
  onRemove,
  disabled,
}: {
  title: string;
  legs: Array<{ name: string; providerId: string }>;
  amount: string;
  onAmountChange: (value: string) => void;
  providers: Provider[];
  providerName: (id: string) => string;
  onLegProvider: (index: number, providerId: string) => void;
  editing: boolean;
  onToggleEdit: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const providerWord = useLabel('provider', 'Staff member');
  const who = [...new Set(legs.map((l) => providerName(l.providerId)).filter(Boolean))].join(', ');
  return (
    <>
      <div className="checkout-service-row checkout-combo-row">
        <div className="checkout-service-avatar">{title.slice(0, 1).toUpperCase()}</div>
        <div className="checkout-service-info">
          <div className="checkout-service-name">{title}</div>
          <div className="checkout-service-sub">Combo · {legs.map((l) => l.name).join(' + ')}{who ? ` · ${who}` : ''}</div>
        </div>
        <div className="checkout-amount-field">
          <span>₹</span>
          <input type="number" inputMode="decimal" min={0} value={amount} onChange={(e) => onAmountChange(e.target.value)} disabled={disabled} aria-label={`${title} price`} />
        </div>
        <button type="button" className="checkout-icon-btn" aria-label={`Change ${providerWord.toLowerCase()}`} aria-expanded={editing} onClick={onToggleEdit} disabled={disabled}>
          <IconEdit />
        </button>
        <button type="button" className="checkout-icon-btn checkout-icon-btn-danger" aria-label={`Remove ${title}`} onClick={onRemove} disabled={disabled}>
          <IconTrash />
        </button>
      </div>
      {editing ? (
        <div className="checkout-combo-legs">
          {legs.map((l, i) => (
            <label key={i}>
              <span>{l.name}</span>
              <select className="checkout-provider-select" value={l.providerId} onChange={(e) => onLegProvider(i, e.target.value)} disabled={disabled}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
    </>
  );
}

let addedCounter = 0;
const nextKey = (prefix: string) => `${prefix}-${(addedCounter += 1)}`;

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
  offers = [],
  groupMembers = [],
  timezone,
  onClose,
  onBack,
  onSaved,
}: {
  appointment: Appointment;
  services: Service[];
  providers: Provider[];
  /** Jira GRW-314 — the salon's offers; the running combos among them can be added at this screen. */
  offers?: Offer[];
  /** The combo's other still-booked legs — completed together, each its own service row. */
  groupMembers?: Appointment[];
  timezone: string;
  onClose: () => void;
  /**
   * GRW-199 — go back to whatever opened this, instead of only out.
   *
   * The till is the last step of the walk-in flow, and "Cancel" there closes
   * the whole thing: a receptionist who opened it to check the total, or who
   * picked the wrong client, had no way back to the step before without
   * starting the visit again. Absent when the till is opened from a booking
   * row, where there is no previous step to return to.
   */
  onBack?: () => void;
  /**
   * Jira GRW-289 — called after a successful save, INSTEAD of `onClose`.
   *
   * `onClose` meant both "saved" and "walked away" (Cancel, the backdrop), so a
   * caller could not tell a paid visit from an abandoned till. Record payment
   * needs to: abandoning it leaves a visit recorded and unpaid. Absent, a save
   * still calls `onClose`, which is every other caller's behaviour unchanged.
   */
  onSaved?: () => void;
}) {
  const router = useRouter();
  /*
   * Jira GRW-314 — the visit as lines. Pre-filled from what was booked (a combo's own price, a service's
   * list price) and its own stylist, so the common case — paid exactly what was quoted — needs no typing.
   * A combo is one line whatever number of services it holds.
   */
  const [lines, setLines] = useState<Line[]>(() => buildLines([appointment, ...groupMembers]));
  const [addedServices, setAddedServices] = useState<AddedService[]>([]);
  const [addedCombos, setAddedCombos] = useState<AddedCombo[]>([]);
  const [pick, setPick] = useState('');
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerName = (id: string) => providers.find((p) => p.id === id)?.displayName ?? '';
  const originalProviderId =
    lines.flatMap((l) => (l.kind === 'leg' ? [l.leg] : l.legs)).find((l) => l.id === appointment.id)?.providerId ?? appointment.providerId ?? '';

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  const setLegProvider = (key: string, legIndex: number, providerId: string) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        return l.kind === 'leg' ? { ...l, leg: { ...l.leg, providerId } } : { ...l, legs: l.legs.map((g, i) => (i === legIndex ? { ...g, providerId } : g)) };
      }),
    );
  const takeOff = (key: string, removed: boolean) => {
    updateLine(key, { removed });
    if (removed && editingRow === key) setEditingRow(null);
  };

  // What can be added here: any service, and any combo that is running with all its services on hand.
  const combos = offers.filter((o) => o.active && o.comboPriceMinor && o.serviceIds.length > 0 && o.serviceIds.every((id) => services.some((s) => s.id === id)));
  const add = () => {
    if (!pick) return;
    if (pick.startsWith('offer:')) {
      const offer = combos.find((o) => o.id === pick.slice(6));
      if (!offer) return;
      const legs = offer.serviceIds.map((id) => {
        const svc = services.find((s) => s.id === id)!;
        return { serviceId: id, name: svc.name, listMinor: Number(svc.priceMinor ?? 0), providerId: originalProviderId };
      });
      setAddedCombos((cs) => [
        ...cs,
        { key: nextKey('combo'), offerId: offer.id, title: offer.title, comboPriceMinor: Number(offer.comboPriceMinor), legs, amount: minorToRupees(offer.comboPriceMinor) },
      ]);
    } else {
      const svc = services.find((s) => s.id === pick.slice(4));
      if (!svc) return;
      setAddedServices((xs) => [...xs, { key: nextKey('svc'), serviceId: svc.id, name: svc.name, amount: minorToRupees(svc.priceMinor ?? null), providerId: originalProviderId }]);
    }
    setPick('');
  };

  const kept = lines.filter((l) => !l.removed);
  const takenOff = lines.filter((l) => l.removed);
  const hasAnyService = hasAnythingOnTheBill(lines, addedServices, addedCombos);
  const valid = hasAnyService && amountsAreValid(lines, addedServices, addedCombos);
  const totalMinor = billTotalMinor(lines, addedServices, addedCombos);

  // What the combos on the bill save, for the line under the total.
  const keptCombos = [
    ...kept.flatMap((l) => (l.kind === 'combo' ? [{ title: l.title, list: l.legs.reduce((n, g) => n + g.listMinor, 0), saving: comboSavingMinor(l.legs, l.comboPriceMinor) }] : [])),
    ...addedCombos.map((c) => ({ title: c.title, list: c.legs.reduce((n, g) => n + g.listMinor, 0), saving: comboSavingMinor(c.legs, c.comboPriceMinor) })),
  ];
  const savingMinor = keptCombos.reduce((n, c) => n + c.saving, 0);

  // Jira GRW-314 — what is still on the bill: a combo is named once, and a service taken off is not named.
  const billNames = [...kept.map((l) => (l.kind === 'combo' ? l.title : l.leg.name)), ...addedCombos.map((c) => c.title)];

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.checkout(appointment.id, buildCheckoutRequest({ originalId: appointment.id, lines, addedServices, addedCombos, paymentMode }));
      router.refresh();
      (onSaved ?? onClose)();
    } catch (err) {
      setError(err instanceof BookingConflictError ? err.message : 'That did not save. Check the connection and try again.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal modal-fit checkout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-header">
          <div className="checkout-header-icon">
            <IconCheck />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>Mark as done</h3>
            <div className="checkout-header-name">
              {appointment.customerName ?? 'Unknown'}
              {/* No number, no call button — GRW-199. A walk-in may have given
                  only a name, and a `tel:` link built from an empty string is a
                  control that looks live and does nothing. */}
              {dialable(appointment.customerPhone) && (
                <a className="checkout-call-btn" href={`tel:${dialable(appointment.customerPhone)}`} aria-label="Call">
                  <IconPhone />
                </a>
              )}
            </div>
            <div className="checkout-header-sub">
              {billNames.length > 1
                ? `${summarizeServices(billNames)} · ${formatTime(appointment.startAt, timezone)}`
                : `${billNames[0] ?? 'No service left'}${kept[0]?.kind === 'leg' && providerName(kept[0].leg.providerId) ? ` · ${providerName(kept[0].leg.providerId)}` : ''} · ${formatTime(appointment.startAt, timezone)}`}
            </div>
          </div>
        </div>

        <div className="modal-body">
          <div className="checkout-total-card">
            <div className="checkout-total-icon">
              <IconWallet />
            </div>
            <div>
              <div className="checkout-total-label">Total amount</div>
              <div className="checkout-total-value">{formatMoney(String(totalMinor))}</div>
              {/*
                GRW-199 — say what the combo took off. The saving is the reason the customer chose the
                combo, and the till is where they ask about it. (GRW-314: one combo names itself; more
                than one is added up.)
              */}
              {savingMinor > 0 && (
                <div className="checkout-total-saving">
                  {keptCombos.length === 1 ? `${keptCombos[0]!.title} — ${formatMoney(String(keptCombos[0]!.list))} list, saves ${formatMoney(String(savingMinor))}` : `Combos — saves ${formatMoney(String(savingMinor))}`}
                </div>
              )}
            </div>
          </div>

          <div className="checkout-section-label">Services</div>

          {kept.map((l) =>
            l.kind === 'combo' ? (
              <ComboRow
                key={l.key}
                title={l.title}
                legs={l.legs}
                amount={l.amount}
                onAmountChange={(value) => updateLine(l.key, { amount: value })}
                providers={providers}
                providerName={providerName}
                onLegProvider={(i, id) => setLegProvider(l.key, i, id)}
                editing={editingRow === l.key}
                onToggleEdit={() => setEditingRow(editingRow === l.key ? null : l.key)}
                onRemove={() => takeOff(l.key, true)}
                disabled={busy}
              />
            ) : (
              <ServiceRow
                key={l.key}
                name={l.leg.name}
                amount={l.amount}
                onAmountChange={(value) => updateLine(l.key, { amount: value })}
                providerId={l.leg.providerId}
                providerName={providerName(l.leg.providerId)}
                providers={providers}
                onProviderChange={(id) => setLegProvider(l.key, 0, id)}
                editing={editingRow === l.key}
                onToggleEdit={() => setEditingRow(editingRow === l.key ? null : l.key)}
                onRemove={() => takeOff(l.key, true)}
                disabled={busy}
              />
            ),
          )}

          {addedCombos.map((c) => (
            <ComboRow
              key={c.key}
              title={c.title}
              legs={c.legs}
              amount={c.amount}
              onAmountChange={(value) => setAddedCombos((cs) => cs.map((x) => (x.key === c.key ? { ...x, amount: value } : x)))}
              providers={providers}
              providerName={providerName}
              onLegProvider={(i, id) => setAddedCombos((cs) => cs.map((x) => (x.key === c.key ? { ...x, legs: x.legs.map((g, gi) => (gi === i ? { ...g, providerId: id } : g)) } : x)))}
              editing={editingRow === c.key}
              onToggleEdit={() => setEditingRow(editingRow === c.key ? null : c.key)}
              onRemove={() => setAddedCombos((cs) => cs.filter((x) => x.key !== c.key))}
              disabled={busy}
            />
          ))}

          {addedServices.map((x) => (
            <ServiceRow
              key={x.key}
              name={x.name}
              amount={x.amount}
              onAmountChange={(value) => setAddedServices((xs) => xs.map((y) => (y.key === x.key ? { ...y, amount: value } : y)))}
              providerId={x.providerId}
              providerName={providerName(x.providerId)}
              providers={providers}
              onProviderChange={(id) => setAddedServices((xs) => xs.map((y) => (y.key === x.key ? { ...y, providerId: id } : y)))}
              editing={editingRow === x.key}
              onToggleEdit={() => setEditingRow(editingRow === x.key ? null : x.key)}
              onRemove={() => setAddedServices((xs) => xs.filter((y) => y.key !== x.key))}
              disabled={busy}
            />
          ))}

          {!hasAnyService && (
            <div className="muted" style={{ padding: '10px 0', fontSize: 13 }}>
              Nothing left to save. Add a service or a combo, or put one back.
            </div>
          )}

          {/* Jira GRW-314 — what was taken off, one tap from coming back whole, with its amount and stylist. */}
          {takenOff.length > 0 && (
            <div className="checkout-removed" role="group" aria-label="Taken off">
              <div className="checkout-section-label">Taken off</div>
              {takenOff.map((l) => (
                <div className="checkout-removed-row" key={l.key}>
                  <span>{l.kind === 'combo' ? l.title : l.leg.name}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => takeOff(l.key, false)} disabled={busy}>
                    Put back
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="checkout-add-row">
            <select value={pick} onChange={(e) => setPick(e.target.value)} disabled={busy} aria-label="Add a service or a combo">
              <option value="">Select a service or combo</option>
              {combos.length > 0 && (
                <optgroup label="Combos">
                  {combos.map((o) => (
                    <option key={o.id} value={`offer:${o.id}`}>
                      {o.title} — {formatMoney(o.comboPriceMinor!)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Services">
                {services.map((s) => (
                  <option key={s.id} value={`svc:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <button type="button" className="btn" onClick={add} disabled={busy || !pick}>
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
        </div>

        <div className="modal-actions">
          {onBack && (
            <button className="btn btn-ghost checkout-back" onClick={onBack} disabled={busy}>
              Back
            </button>
          )}
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
