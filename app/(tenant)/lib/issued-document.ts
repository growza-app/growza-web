/**
 * QA 2026-11-14 — what kind of document a `document_issued` refusal is about.
 *
 * The API has always sent `docType` beside `documentNumber`; the screens read only the number and called every
 * document an "Invoice", and on a return told the desk it owed a credit note. A shop that is not registered for GST
 * gives a plain receipt (2026-27/0001): there is no tax invoice to credit. A refusal from an older API, or one with a
 * type this build does not know, reads as an invoice — the cautious answer, which keeps the credit-note line.
 */
export type IssuedDocKind = 'tax_invoice' | 'bill_of_supply' | 'receipt';

export function issuedDocKind(body: unknown): IssuedDocKind {
  const t = (body as { docType?: unknown } | null | undefined)?.docType;
  return t === 'receipt' || t === 'bill_of_supply' ? t : 'tax_invoice';
}
