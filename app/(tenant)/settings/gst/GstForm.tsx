'use client';

import { useTranslations } from 'next-intl';
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
type Status = (typeof STATUSES)[number];

export function GstForm({ initial, branchName }: { initial: SettingsSummary; branchName: string | null }) {
  const t = useTranslations('settingsGst');
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
      });
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
            {t('hint')}
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
            <span className="field-hint">{t(`statusHelp.${status}`)}</span>
          </div>

          {!registered ? (
            <p className="field-hint">{t('notRegisteredNote')}</p>
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
              <div id="gst-inclusive-note" style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 620, fontSize: 14 }}>{t('pricesIncludeTaxLabel')}</div>
                <span className="field-hint" style={{ margin: '4px 0 0' }}>
                  {t('pricesIncludeTaxOn')}
                </span>
              </div>
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
