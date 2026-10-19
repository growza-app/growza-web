'use client';

import { useTranslations } from 'next-intl';
import { formatMoney } from '../lib/format';
import { gstInPrice } from '../lib/gst-in-price';

/**
 * Jira GRW-582 — what a service or a product is, for tax: its GST rate and its classification code.
 *
 * One component for both forms, because they are the same two questions with one word different (a service has a SAC,
 * a product an HSN) and the same limits. It was written inline in the product sheet first; the service form is the
 * second place, which is when it stops being copied.
 *
 * Collapsed unless the item already has something set: most businesses never touch it, and a salon that is not
 * registered for GST should not be handed two fields it has no use for. Nothing here is required — the invoice says
 * which line is missing what, at the moment it matters.
 *
 * The code is digits only, 4 to 8, because that is what an invoice line can hold. Filtered as it is typed rather than
 * refused later: "ARG-1" on a shelf that then fails a customer's invoice at the till was how this was found.
 */
const GST_SLABS_BP = [0, 500, 1200, 1800, 2800] as const;

export function TaxFields({
  idPrefix,
  kind,
  rateBp,
  onRateBp,
  code,
  onCode,
  open,
  onToggle,
  savedRateBp,
}: {
  /** Distinct per form, so two sheets on one page never share an id. */
  idPrefix: string;
  kind: 'service' | 'product';
  /** The rate as the select holds it: basis points as text, or '' for "not set". */
  rateBp: string;
  onRateBp: (next: string) => void;
  code: string;
  onCode: (next: string) => void;
  open: boolean;
  onToggle: () => void;
  /** The rate already stored, so a value that is no standard slab (an older import) is still offered, not lost. */
  savedRateBp?: number | null;
}) {
  const t = useTranslations('tax');
  const slabs =
    savedRateBp != null && !GST_SLABS_BP.includes(savedRateBp as (typeof GST_SLABS_BP)[number])
      ? [...GST_SLABS_BP, savedRateBp].sort((a, b) => a - b)
      : GST_SLABS_BP;
  const parts = [rateBp !== '' ? `${Number(rateBp) / 100}%` : null, code.trim() || null].filter(Boolean);
  const codeWord = kind === 'service' ? t('sac') : t('hsn');

  return (
    <>
      <div className="sheet-group">
        <button type="button" className="sheet-row pe-disclosure" aria-expanded={open} onClick={onToggle}>
          <span className="sheet-row-label">{t('title')}</span>
          <span className="sheet-row-value pe-disclosure-value">
            {parts.length > 0 ? parts.join(' · ') : t('notSet')}
            <span className="pe-chevron" aria-hidden="true" />
          </span>
        </button>
        {open ? (
          <>
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor={`${idPrefix}-gst`}>
                {t('gstRate')}
              </label>
              <div className="sheet-row-value">
                <select id={`${idPrefix}-gst`} value={rateBp} aria-describedby={`${idPrefix}-tax-hint`} onChange={(e) => onRateBp(e.target.value)}>
                  <option value="">{t('notSet')}</option>
                  {slabs.map((bp) => (
                    <option key={bp} value={String(bp)}>
                      {bp / 100}%
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sheet-row">
              <label className="sheet-row-label" htmlFor={`${idPrefix}-code`}>
                {codeWord}
              </label>
              <div className="sheet-row-value">
                <input
                  id={`${idPrefix}-code`}
                  type="text"
                  inputMode="numeric"
                  value={code}
                  placeholder={t('notSet')}
                  maxLength={8}
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${idPrefix}-tax-hint`}
                  onChange={(e) => onCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
      {open ? (
        <div id={`${idPrefix}-tax-hint`} className="sheet-foot">
          {t('hint', { code: codeWord })} {t('pricesInclude')}
        </div>
      ) : null}
    </>
  );
}

/**
 * The line under a price that says how much of it is GST — the answer to "does the price I typed have GST in it?".
 * Drawn only when there is a rate and a price to say it about.
 */
export function GstInPrice({ priceMinor, rateBp }: { priceMinor: number; rateBp: string }) {
  const t = useTranslations('tax');
  const rate = rateBp === '' ? null : Number(rateBp);
  const parts = gstInPrice(priceMinor, rate);
  if (!parts || rate === null) return null;
  return (
    <div className="sheet-foot" role="status">
      {t('includedIn', { tax: formatMoney(parts.taxMinor), rate: rate / 100, total: formatMoney(priceMinor) })}
    </div>
  );
}
