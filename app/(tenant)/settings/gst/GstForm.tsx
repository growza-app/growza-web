'use client';

import { useTranslations } from 'next-intl';
import { useNouns } from '../../lib/use-nouns';
import { useState } from 'react';
import { api, ApiError, type SettingsSummary } from '../../lib/api';
import { SettingsSaveBar } from '../SettingsSaveBar';
import { useCloseAfterSave } from '../../lib/close-after-save';

/**
 * Jira GRW-582 — the details that turn a receipt into a tax invoice.
 *
 * **Asked here, not at enrolment** (owner, 2026-10-17). Most businesses do not have their GSTIN to hand on the day
 * they sign up, and many are not registered at all; a tax question standing between a salon and its first booking
 * gets a wrong answer typed to get past it — and a wrong GSTIN is printed on documents that go into somebody else's
 * books. So the screen is here, it is never a gate, and a business that ignores it for ever keeps giving out receipts.
 *
 * The whole form is one Save. The API decides what belongs to the business and what to the branch, and judges the
 * fields together: a status and a number set in the same Save are one decision, and a refusal keeps the lot.
 *
 * Everything below `status` is hidden while the answer is "not registered", because none of it means anything then —
 * and a form that asks an unregistered shop for its registered address is a form that teaches people to type
 * something, anything, to make the field go away.
 */
const STATUSES = ['unregistered', 'regular', 'composition'] as const;
/** Jira GRW-736 — the GST rates an order type can take, as the council sets them (basis points). */
const RATES = [0, 500, 1200, 1800, 2800] as const;
const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'] as const;
type OrderTypeRates = { dine_in: number | null; takeaway: number | null; delivery: number | null };
type Status = (typeof STATUSES)[number];

export function GstForm({ initial, branchName }: { initial: SettingsSummary; branchName: string | null }) {
  const t = useTranslations('settingsGst');
  // QA 13 Nov 2026, bug 8 — "your customers" at a clinic: the business's own word (patients, guests).
  const { customers } = useNouns();
  const closeForm = useCloseAfterSave('/settings');

  const [status, setStatus] = useState<Status>(initial.gst.status);
  const [gstin, setGstin] = useState(initial.gst.gstin);
  const [legalName, setLegalName] = useState(initial.gst.legalName);
  const [registeredAddress, setRegisteredAddress] = useState(initial.gst.registeredAddress);
  const [invoicePrefix, setInvoicePrefix] = useState(initial.gst.invoicePrefix);
  const [invoiceFooter, setInvoiceFooter] = useState(initial.gst.invoiceFooter);
  const [branchState, setBranchState] = useState(initial.gst.branchState);
  const [branchStateCode, setBranchStateCode] = useState(initial.gst.branchStateCode);
  const [branchGstin, setBranchGstin] = useState(initial.gst.branchGstin);
  // Jira GRW-736 — prices include GST, or GST is added on top; and a rate per order type (null: each dish's own rate).
  const [pricesIncludeTax, setPricesIncludeTax] = useState(initial.gst.pricesIncludeTax);
  const [typeRates, setTypeRates] = useState<OrderTypeRates>(initial.gst.orderTypeRates ?? { dine_in: null, takeaway: null, delivery: null });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which field the API refused, so the message sits on the box the owner has to change. */
  const [badField, setBadField] = useState<string | null>(null);

  const registered = status !== 'unregistered';
  const touched = () => {
    setError(null);
    setBadField(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setBadField(null);
    try {
      const fresh = await api.updateGstSettings({
        status,
        gstin,
        legalName,
        registeredAddress,
        invoicePrefix,
        invoiceFooter,
        branchState,
        branchStateCode,
        branchGstin,
        // Jira GRW-736 — only a business that charges GST says how; the API keeps the rest as it was.
        ...(status === 'regular' ? { pricesIncludeTax, orderTypeRates: typeRates } : {}),
      }, initial.scope.locationId);
      setPricesIncludeTax(fresh.gst.pricesIncludeTax);
      if (fresh.gst.orderTypeRates) setTypeRates(fresh.gst.orderTypeRates);
      // Shown back from the server's answer, not from what was typed: it trims, upper-cases a GSTIN and may drop
      // what it would not store, and the screen should show what is now on file.
      setStatus(fresh.gst.status);
      setGstin(fresh.gst.gstin);
      setLegalName(fresh.gst.legalName);
      setRegisteredAddress(fresh.gst.registeredAddress);
      setInvoicePrefix(fresh.gst.invoicePrefix);
      setInvoiceFooter(fresh.gst.invoiceFooter);
      setBranchState(fresh.gst.branchState);
      setBranchStateCode(fresh.gst.branchStateCode);
      setBranchGstin(fresh.gst.branchGstin);
      closeForm();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        setError(e.message);
        setBadField((e.body as { field?: string } | undefined)?.field ?? null);
      } else {
        setError(t('errors.saveFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (name: string) =>
    badField === name && error ? (
      <div role="alert" className="field-error">
        {error}
      </div>
    ) : null;

  const prefixExample = invoicePrefix.trim() ? `${invoicePrefix.trim()}/2026-27/0001` : '2026-27/0001';

  return (
    <>
      <div className="card">
        <div className="card-head">{t('title')}</div>
        <div className="card-body">
          <p className="field-hint" style={{ marginTop: 0 }}>
            {t('hint', { customers })}
          </p>

          <div className="field">
            <label className="field-label" htmlFor="gst-status">
              {t('statusLabel')}
            </label>
            <select
              id="gst-status"
              value={status}
              disabled={busy}
              onChange={(e) => {
                setStatus(e.target.value as Status);
                touched();
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
            {/* What this choice MEANS for the customer, in the words the customer would use. */}
            <span className="field-hint">{t(`statusHelp.${status}`, { customers })}</span>
          </div>

          {!registered ? (
            <p className="field-hint">{t('notRegisteredNote', { customers })}</p>
          ) : (
            <>
              <div className="field">
                <label className="field-label" htmlFor="gst-gstin">
                  {t('gstinLabel')}
                </label>
                <input
                  id="gst-gstin"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={20}
                  value={gstin}
                  disabled={busy}
                  onChange={(e) => {
                    setGstin(e.target.value);
                    touched();
                  }}
                />
                <span className="field-hint">{t('gstinHint')}</span>
                {fieldError('gstin')}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="gst-legal-name">
                  {t('legalNameLabel')}
                </label>
                <input
                  id="gst-legal-name"
                  type="text"
                  maxLength={160}
                  value={legalName}
                  disabled={busy}
                  onChange={(e) => {
                    setLegalName(e.target.value);
                    touched();
                  }}
                />
                <span className="field-hint">{t('legalNameHint')}</span>
                {fieldError('legalName')}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="gst-address">
                  {t('addressLabel')}
                </label>
                <input
                  id="gst-address"
                  type="text"
                  maxLength={300}
                  value={registeredAddress}
                  disabled={busy}
                  onChange={(e) => {
                    setRegisteredAddress(e.target.value);
                    touched();
                  }}
                />
                {fieldError('registeredAddress')}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="gst-prefix">
                  {t('prefixLabel')}
                </label>
                <input
                  id="gst-prefix"
                  type="text"
                  maxLength={10}
                  spellCheck={false}
                  value={invoicePrefix}
                  disabled={busy}
                  onChange={(e) => {
                    setInvoicePrefix(e.target.value);
                    touched();
                  }}
                />
                {/* The number they will actually see, rebuilt as they type, rather than a rule about prefixes. */}
                <span className="field-hint">{t('prefixHint', { example: prefixExample, plain: '2026-27/0001' })}</span>
                {fieldError('invoicePrefix')}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="gst-footer">
                  {t('footerLabel')}
                </label>
                <input
                  id="gst-footer"
                  type="text"
                  maxLength={500}
                  value={invoiceFooter}
                  disabled={busy}
                  onChange={(e) => {
                    setInvoiceFooter(e.target.value);
                    touched();
                  }}
                />
                <span className="field-hint">{t('footerHint')}</span>
              </div>

              {/*
                Not a choice. Prices include GST: the till charges the price that was typed and never adds tax on top,
                so a switch for "tax is added at the till" promised something the till does not do, and an invoice
                built on it would have totalled more than was collected. Said plainly instead, so an owner knows what
                a price on the menu means.
              */}
              {/*
                Jira GRW-736 — now a choice, for a business that charges GST: the price on the menu includes it, or GST is
                added on top and the till collects it (the bill shows each tax and the total with it). And a rate per order
                type — Dine-in, Takeaway, Delivery — where the law asks for one; each dish's own rate otherwise.
              */}
              {status === 'regular' ? (
                <>
                  <fieldset className="gst-choice" id="gst-inclusive-note">
                    <legend className="gst-choice-label">{t('pricesIncludeTaxLabel')}</legend>
                    {[true, false].map((on) => (
                      <label key={String(on)} className="gst-radio">
                        <input
                          type="radio"
                          name="gst-inclusive"
                          checked={pricesIncludeTax === on}
                          onChange={() => {
                            setPricesIncludeTax(on);
                            touched();
                          }}
                        />
                        <span>{on ? t('taxIncluded') : t('taxOnTop')}</span>
                      </label>
                    ))}
                    <span className="field-hint">{pricesIncludeTax ? t('taxIncludedHint') : t('taxOnTopHint')}</span>
                  </fieldset>
                  <fieldset className="gst-choice">
                    <legend className="gst-choice-label">{t('byTypeLabel')}</legend>
                    <span className="field-hint">{t('byTypeHint')}</span>
                    {ORDER_TYPES.map((type) => (
                      <label key={type} className="gst-type-row">
                        <span>{t(`byType.${type}`)}</span>
                        <select
                          value={typeRates[type] === null ? '' : String(typeRates[type])}
                          onChange={(e) => {
                            setTypeRates((r) => ({ ...r, [type]: e.target.value === '' ? null : Number(e.target.value) }));
                            touched();
                          }}
                        >
                          <option value="">{t('dishRate')}</option>
                          {RATES.map((bp) => (
                            <option key={bp} value={bp}>
                              {bp / 100}%
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                </>
              ) : (
                <div style={{ marginTop: 4 }}>
                  {/* Review of the overnight stack (item 14) — a token, never an inline px size. */}
                  <div className="gst-fixed-label">{t('pricesIncludeTaxLabel')}</div>
                  <span className="field-hint" style={{ margin: '4px 0 0' }}>
                    {t('pricesIncludeTaxOn')}
                  </span>
                </div>
              )}
            </>
          )}

          {error && !badField ? (
            <div role="alert" className="field-error">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {registered ? (
        <div className="card">
          <div className="card-head">{branchName ?? t('branchTitle')}</div>
          <div className="card-body">
            <p className="field-hint" style={{ marginTop: 0 }}>
              {t('branchHint')}
            </p>

            <div className="field">
              <label className="field-label" htmlFor="gst-state">
                {t('stateLabel')}
              </label>
              <input
                id="gst-state"
                type="text"
                maxLength={60}
                value={branchState}
                disabled={busy}
                onChange={(e) => {
                  setBranchState(e.target.value);
                  touched();
                }}
              />
              {fieldError('branchState')}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="gst-state-code">
                {t('stateCodeLabel')}
              </label>
              <input
                id="gst-state-code"
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={branchStateCode}
                disabled={busy}
                onChange={(e) => {
                  setBranchStateCode(e.target.value);
                  touched();
                }}
              />
              <span className="field-hint">{t('stateCodeHint')}</span>
              {fieldError('branchStateCode')}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="gst-branch-gstin">
                {t('branchGstinLabel')}
              </label>
              <input
                id="gst-branch-gstin"
                type="text"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={20}
                value={branchGstin}
                disabled={busy}
                onChange={(e) => {
                  setBranchGstin(e.target.value);
                  touched();
                }}
              />
              <span className="field-hint">{t('branchGstinHint')}</span>
              {fieldError('branchGstin')}
            </div>
          </div>
        </div>
      ) : null}

      <SettingsSaveBar
        busy={busy}
        onSave={() => void save()}
        saveLabel={t('save')}
        savingLabel={t('saving')}
      />
    </>
  );
}
