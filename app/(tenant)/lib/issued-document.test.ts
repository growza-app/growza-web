import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { issuedDocKind, type IssuedDocKind } from './issued-document';

/**
 * QA 2026-11-14, F9 — Neha returned one of two items on a plain receipt (2026-27/0001, not GST-registered) and was
 * told "Invoice 2026-27/0001 was already given … you will need to give them a credit note". A receipt has no credit
 * note. The refusal always carried `docType`; the screens now read it.
 */
function Say({ ns, k, values }: { ns: 'sales.returnSheet' | 'chrome.correct' | 'orders.detail.swap'; k: string; values: Record<string, string> }) {
  const t = useTranslations(ns);
  return createElement('p', null, t(k as never, values as never));
}
const say = (locale: 'en' | 'hi', ns: Parameters<typeof Say>[0]['ns'], k: string, values: Record<string, string>) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, children: createElement(Say, { ns, k, values }) }));

describe('an issued document is called what it is', () => {
  it('reads the type from the refusal, and an unknown or missing one is an invoice', () => {
    expect(issuedDocKind({ docType: 'receipt' })).toBe('receipt');
    expect(issuedDocKind({ docType: 'bill_of_supply' })).toBe('bill_of_supply');
    expect(issuedDocKind({ docType: 'tax_invoice' })).toBe('tax_invoice');
    expect(issuedDocKind({})).toBe('tax_invoice');
    expect(issuedDocKind(undefined)).toBe('tax_invoice');
  });

  it('a return on a receipt says receipt and owes no credit note; on a tax invoice it still does', () => {
    const receipt = say('en', 'sales.returnSheet', 'documentIssuedBody', { number: '2026-27/0001', doc: 'receipt' });
    expect(receipt).toContain('Receipt 2026-27/0001 was already given');
    expect(receipt).not.toMatch(/credit note|Invoice/);
    const invoice = say('en', 'sales.returnSheet', 'documentIssuedBody', { number: 'GZ/0007', doc: 'tax_invoice' as IssuedDocKind });
    expect(invoice).toContain('Invoice GZ/0007');
    expect(invoice).toContain('credit note');
    expect(say('en', 'sales.returnSheet', 'documentIssuedBodyNoNumber', { doc: 'receipt' })).toContain('A receipt was already given');
  });

  it('in Hindi too', () => {
    const r = say('hi', 'sales.returnSheet', 'documentIssuedBody', { number: '2026-27/0001', doc: 'receipt' });
    expect(r).toContain('रसीद 2026-27/0001');
    expect(r).not.toContain('क्रेडिट नोट');
    expect(say('hi', 'sales.returnSheet', 'documentIssuedBody', { number: 'X', doc: 'tax_invoice' })).toContain('क्रेडिट नोट');
  });

  it('the bill correction and the size swap name it the same way', () => {
    expect(say('en', 'chrome.correct', 'documentIssuedBody', { number: '2026-27/0001', doc: 'receipt' })).toMatch(/^<p>Receipt 2026-27\/0001 was already given/);
    expect(say('hi', 'chrome.correct', 'documentIssuedBody', { number: '2026-27/0001', doc: 'receipt' })).toContain('रसीद 2026-27/0001');
    expect(say('en', 'orders.detail.swap', 'documentIssued', { number: '2026-27/0001', doc: 'receipt' })).toContain('Receipt 2026-27/0001');
    expect(say('en', 'orders.detail.swap', 'documentIssued', { number: 'GZ/1', doc: 'tax_invoice' })).toContain('Invoice GZ/1');
  });
});
