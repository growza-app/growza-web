'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { useDialog } from '../../../shared/a11y/useDialog';
import type { BuyList } from '../../lib/api-types';
import { intlLocale } from '../../lib/format';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { amount, parseAmount, unitWord } from '../../lib/kitchen-units';
import { shareText, waLink, type SupplierGroup } from './buy-list';

/**
 * Jira GRW-739 FR-02 · AC-02 — the What to buy list as a WhatsApp message. Each figure starts at what takes the item to twice its low-stock
 * level and can be changed (or cleared to leave the item off) before sharing. "Open WhatsApp" is a plain `wa.me` link in the owner's own
 * WhatsApp — WhatsApp Web where the app is not installed — and nothing is sent until they press send there. The text can also be copied,
 * and a supplier with a phone number gets their own part of the list straight to their chat.
 */
export function BuyShareSheet({ list, groups, onClose }: { list: BuyList; groups: SupplierGroup[]; onClose: () => void }) {
  const t = useTranslations('kitchenStock.toBuy');
  const locale = useLocale();
  const sheetRef = useRef<HTMLDivElement>(null);
  useDialog(sheetRef, { onClose });
  const [typed, setTyped] = useState<Record<string, string>>(() => Object.fromEntries(list.items.map((i) => [i.materialId, amount(i.suggestQty)])));
  const [copied, setCopied] = useState<boolean | null>(null);

  const qty = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const i of list.items) {
      const text = typed[i.materialId]?.trim() ?? '';
      m.set(i.materialId, text ? parseAmount(text, i.unit, 'big', true) : null);
    }
    return m;
  }, [typed, list.items]);
  const bad = list.items.filter((i) => (typed[i.materialId]?.trim() ?? '') !== '' && qty.get(i.materialId) === null);

  const date = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${list.date}T00:00:00Z`));
  const words = { heading: (d: string) => t('shareHeading', { date: d }), noSupplier: t('noSupplier'), packs: (n: number, label: string) => t('packs', { n, label }) };
  const head = { business: list.business, branch: list.branch, date };
  const text = shareText(head, groups, qty, words);
  const nothing = list.items.every((i) => !(qty.get(i.materialId) ?? 0));

  const copy = async () => setCopied(await copyToClipboard(text));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={sheetRef} className="modal sheet prd-sheet ks-sheet" role="dialog" aria-modal="true" aria-label={t('shareTitle')} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button type="button" className="sheet-head-cancel" onClick={onClose}>
            {t('close')}
          </button>
          <span className="sheet-head-title">{t('shareTitle')}</span>
          <span className="prd-head-spacer" aria-hidden="true" />
        </div>
        <div className="sheet-body prd-form-body">
          <p className="ks-hint">{t('shareHint')}</p>
          {groups.map((g) => (
            <section key={g.supplierId ?? 'none'} className="kb-group" aria-label={g.name ?? t('noSupplier')}>
              <h3 className="kb-supplier">{g.name ?? t('noSupplier')}</h3>
              <ul className="ks-opening-list">
                {g.items.map((i) => (
                  <li key={i.materialId} className="ks-opening-row">
                    <label htmlFor={`kb-qty-${i.materialId}`}>{i.name}</label>
                    <span className="ks-qty-field">
                      <input
                        id={`kb-qty-${i.materialId}`}
                        className="prd-input ks-qty-input"
                        inputMode="decimal"
                        placeholder="0"
                        aria-invalid={bad.includes(i) || undefined}
                        value={typed[i.materialId] ?? ''}
                        onChange={(e) => setTyped((x) => ({ ...x, [i.materialId]: e.target.value }))}
                      />
                      <span className="ks-unit">{unitWord(i.unit)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {g.phone && g.items.some((i) => (qty.get(i.materialId) ?? 0) > 0) ? (
                <a className="mr-link" href={waLink(shareText(head, [g], qty, words), g.phone)} target="_blank" rel="noreferrer">
                  {t('sendTo', { name: g.name ?? '' })}
                </a>
              ) : null}
            </section>
          ))}
          {bad.length > 0 ? (
            <div role="alert" className="sheet-foot sheet-foot-error">
              {bad[0]!.name}: {t('badQty')}
            </div>
          ) : null}
          <label className="prd-field-label" htmlFor="kb-text">
            {t('preview')}
          </label>
          <textarea id="kb-text" className="prd-input kb-text" readOnly rows={Math.min(14, text.split('\n').length + 1)} value={text} />
          {copied !== null ? (
            <p className="ks-notice" role="status">
              {copied ? t('copied') : t('copyFailed')}
            </p>
          ) : null}
        </div>
        <div className="prd-sheet-footer">
          <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
            {t('copy')}
          </button>
          {nothing || bad.length > 0 ? (
            <button type="button" className="btn prd-footer-save" disabled>
              {t('openWhatsApp')}
            </button>
          ) : (
            <a className="btn prd-footer-save" href={waLink(text)} target="_blank" rel="noreferrer">
              {t('openWhatsApp')}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
