'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, formatMoney, type BillOffer, type Product } from '../../lib/api';
import { useBranch } from '../../components/BranchProvider';
import { useWritable } from '../../components/SessionProvider';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconTrash } from '../../components/icons';
import { intlLocale } from '../../lib/format';

/**
 * Jira GRW-735 — a branch's coupons and buy-get offers.
 *
 * One list (what runs now, and how often each was used) and one short form, switched between "Coupon code" and "Buy
 * one, get one". The form sends what was typed and the server decides; a refusal says why where it was typed, and the
 * list is redrawn from what the server answers with, never from a guess. Removing an offer leaves the bills that took
 * it as they are (they keep their own copy).
 */
type Kind = 'coupon' | 'bogo';
const EMPTY = { code: '', way: 'pct' as 'pct' | 'amount', off: '', minBill: '', uses: '', from: '', until: '', name: '', dish: '', buy: '1', get: '1' };

export function BillOffersSetup({ branches }: { branches: Array<{ id: string; name: string }> }) {
  const t = useTranslations('billOffers');
  const locale = useLocale();
  const writable = useWritable();
  const branch = useBranch();
  const [location, setLocation] = useState<string | null>(branch.choice ?? branch.one ?? branches[0]?.id ?? null);
  const [offers, setOffers] = useState<BillOffer[] | null>(null);
  const [menu, setMenu] = useState<Product[]>([]);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Kind>('coupon');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BillOffer | null>(null);
  const money = (minor: number) => formatMoney(String(minor));

  const load = useCallback(async () => {
    if (!location) return;
    setFailed(false);
    try {
      const [o, m] = await Promise.all([api.billOffers(location), api.products(location)]);
      setOffers(o.offers);
      setMenu(m.filter((p) => p.active));
    } catch {
      setFailed(true);
    }
  }, [location]);
  useEffect(() => {
    setOffers(null);
    void load();
  }, [load]);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));
  const rupees = (typed: string) => (typed.trim() === '' ? 0 : Math.round(Number(typed) * 100));

  const add = async () => {
    if (!location) return;
    setBusy(true);
    setError(null);
    try {
      const dates = { validFrom: form.from || null, validUntil: form.until || null, ...(form.name.trim() ? { name: form.name.trim() } : {}) };
      const body =
        kind === 'coupon'
          ? {
              location, kind, code: form.code.trim(), ...dates,
              ...(form.way === 'pct' ? { offPct: Number(form.off) } : { offMinor: rupees(form.off) }),
              minBillMinor: rupees(form.minBill),
              usesPerGuest: form.uses.trim() === '' ? null : Number(form.uses),
            }
          : { location, kind, productId: form.dish, buyQty: Number(form.buy), getQty: Number(form.get), ...dates };
      const res = await api.addBillOffer(body);
      setOffers(res.offers);
      setForm(EMPTY);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const picker =
    branches.length > 1 ? (
      <label className="dt-field kst-branch">
        <span className="field-hint">{t('branch')}</span>
        <select value={location ?? ''} onChange={(e) => setLocation(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  if (!location || failed) {
    return (
      <div className="card">
        <div className="card-body">
          {picker}
          <p className="field-hint">{t('loadFailed')}</p>
        </div>
      </div>
    );
  }
  if (!offers) {
    return (
      <div className="card" aria-busy="true">
        <div className="card-body">
          {picker}
          <p className="field-hint">{t('loading')}</p>
        </div>
      </div>
    );
  }

  const dayWords = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const when = (o: BillOffer) =>
    o.validFrom && o.validUntil
      ? t('dates', { from: dayWords(o.validFrom), until: dayWords(o.validUntil) })
      : o.validFrom
        ? t('fromOnly', { from: dayWords(o.validFrom) })
        : o.validUntil
          ? t('untilOnly', { until: dayWords(o.validUntil) })
          : null;
  const disabled = busy || !writable;

  return (
    <div className="bo">
      <section className="card" aria-labelledby="bo-list-title">
        <div className="card-body">
          {picker}
          <h2 id="bo-list-title" className="kst-title">
            {t('title')}
          </h2>
          <p className="field-hint">{t('intro')}</p>
          {offers.length === 0 ? (
            <p className="field-hint">{t('none')}</p>
          ) : (
            <ul className="bo-list">
              {offers.map((o) => (
                <li key={o.id} className="bo-row">
                  <span className="bo-row-words">
                    <span className="bo-row-name">{o.name}</span>
                    <span className="field-hint">
                      {o.kind === 'coupon'
                        ? t('couponLine', { off: o.offBp !== null ? `${o.offBp / 100}%` : money(o.offMinor ?? 0), min: o.minBillMinor > 0 ? money(o.minBillMinor) : 'none' })
                        : t('bogoLine', { buy: o.buyQty ?? 1, get: o.getQty ?? 1, dish: o.productName ?? '' })}
                    </span>
                    <span className="field-hint">{[when(o), o.usesPerGuest ? t('oncePerGuest', { n: o.usesPerGuest }) : null, t('usedTimes', { n: o.used })].filter(Boolean).join(' · ')}</span>
                  </span>
                  <button type="button" className="btn btn-ghost btn-danger bo-icon" aria-label={t('remove', { name: o.name })} disabled={disabled} onClick={() => setRemoving(o)}>
                    <IconTrash />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card" aria-label={kind === 'coupon' ? t('kindCoupon') : t('kindBogo')}>
        <div className="card-body">
          <div className="bo-kind" role="radiogroup" aria-label={t('title')}>
            {(['coupon', 'bogo'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => { setKind(k); setError(null); }}>
                {k === 'coupon' ? t('kindCoupon') : t('kindBogo')}
              </button>
            ))}
          </div>
          <form
            className="bo-form"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            {kind === 'coupon' ? (
              <>
                <label className="dt-field">
                  <span className="field-hint">{t('code')}</span>
                  <input type="text" autoCapitalize="characters" autoComplete="off" maxLength={20} placeholder={t('codeHint')} value={form.code} onChange={(e) => set({ code: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} />
                </label>
                <label className="dt-field">
                  <span className="field-hint">{t('offWay')}</span>
                  <select value={form.way} onChange={(e) => set({ way: e.target.value as 'pct' | 'amount' })}>
                    <option value="pct">{t('pct')}</option>
                    <option value="amount">{t('amount')}</option>
                  </select>
                </label>
                <label className="dt-field">
                  <span className="field-hint">{form.way === 'pct' ? t('pct') : t('amount')}</span>
                  <input type="text" inputMode="decimal" autoComplete="off" value={form.off} onChange={(e) => set({ off: e.target.value.replace(/[^0-9.]/g, '') })} />
                </label>
                <label className="dt-field">
                  <span className="field-hint">{t('minBill')}</span>
                  <input type="text" inputMode="numeric" autoComplete="off" value={form.minBill} onChange={(e) => set({ minBill: e.target.value.replace(/[^0-9]/g, '') })} />
                </label>
                <label className="dt-field">
                  <span className="field-hint">{t('usesPerGuest')}</span>
                  <input type="text" inputMode="numeric" autoComplete="off" placeholder={t('usesAny')} value={form.uses} onChange={(e) => set({ uses: e.target.value.replace(/[^0-9]/g, '') })} />
                </label>
              </>
            ) : (
              <>
                <label className="dt-field">
                  <span className="field-hint">{t('dish')}</span>
                  <select value={form.dish} onChange={(e) => set({ dish: e.target.value })}>
                    <option value="">{t('pickDish')}</option>
                    {menu.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dt-field">
                  <span className="field-hint">{t('buy')}</span>
                  <input type="number" inputMode="numeric" min={1} max={20} value={form.buy} onChange={(e) => set({ buy: e.target.value })} />
                </label>
                <label className="dt-field">
                  <span className="field-hint">{t('get')}</span>
                  <input type="number" inputMode="numeric" min={1} max={20} value={form.get} onChange={(e) => set({ get: e.target.value })} />
                </label>
              </>
            )}
            <label className="dt-field">
              <span className="field-hint">{t('from')}</span>
              <input type="date" value={form.from} onChange={(e) => set({ from: e.target.value })} />
            </label>
            <label className="dt-field">
              <span className="field-hint">{t('until')}</span>
              <input type="date" value={form.until} onChange={(e) => set({ until: e.target.value })} />
            </label>
            <label className="dt-field">
              <span className="field-hint">{t('name')}</span>
              <input type="text" maxLength={60} autoComplete="off" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <button type="submit" className="btn" disabled={disabled || (kind === 'coupon' ? form.code.length < 3 || form.off === '' : form.dish === '')}>
              {kind === 'coupon' ? t('save') : t('saveBogo')}
            </button>
          </form>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {removing ? (
        <ConfirmDialog
          title={t('removeTitle', { name: removing.name })}
          body={t('removeBody')}
          confirmLabel={t('confirmRemove')}
          cancelLabel={t('cancel')}
          tone="danger"
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              setOffers((await api.removeBillOffer(removing.id)).offers);
              setRemoving(null);
            } catch (e) {
              setError(e instanceof ApiError ? e.message : t('saveFailed'));
              setRemoving(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
