'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * Jira GRW-582 — the receipt or GST invoice, offered on the screen that just took the money.
 *
 * ## Why it asks first, and only then offers a button
 *
 * The screen asks the server what the document for this bill WOULD be before it offers anything. That costs one
 * read, and it buys the thing that matters: an owner whose GSTIN is missing finds out here, with the customer still
 * at the counter and the number in their phone, instead of tapping a button that fails. The sentence says which
 * field to go and fix.
 *
 * ## Why it never blocks
 *
 * The payment has already happened. Nothing on this component can undo that, and nothing it does is allowed to look
 * as though it might: a refusal is a line of text beside the amount, never a dialog over it, and the Next customer
 * button beside it stays live throughout. A busy counter does not stop for a document.
 *
 * Issuing is idempotent per bill, so a double tap, a retry and a later visit from the Sales register all land on the
 * same document under the same number.
 */
type Preview = {
  docType: 'tax_invoice' | 'bill_of_supply' | 'receipt';
  issued: { id: string; number: string } | null;
};

export function DocumentAction({ visitKey }: { visitKey: string }) {
  const t = useTranslations('documents');
  const [preview, setPreview] = useState<Preview | null>(null);
  /** The reason the business cannot have one yet, in its own words. Shown, never thrown away. */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; number: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One issue at a time, however fast the button is tapped. */
  const issuing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .documentPreview(visitKey)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setIssued(p.issued);
      })
      .catch((e) => {
        if (cancelled) return;
        // A 409 is the business's own settings refusing it, and it carries the sentence worth reading. Anything
        // else is ours, and this screen stays quiet about it rather than worrying somebody who has been paid.
        if (e instanceof ApiError && e.status === 409) setBlocked(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [visitKey]);

  const issue = async () => {
    if (issuing.current) return;
    issuing.current = true;
    setBusy(true);
    setError(null);
    try {
      const doc = await api.issueDocument(visitKey);
      setIssued({ id: doc.id, number: doc.number });
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : t('couldNotMake'));
    } finally {
      issuing.current = false;
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <p className="pf-kept" role="status">
        {blocked}
      </p>
    );
  }
  if (!preview) return null;

  const title = t(`type.${preview.docType}`);

  return (
    <div className="pf-doc">
      {issued ? (
        <a className="btn btn-ghost pf-go-alt" href={`/documents/${issued.id}`}>
          {t('view', { title })} · {issued.number}
        </a>
      ) : (
        <button type="button" className="btn btn-ghost pf-go-alt" disabled={busy} onClick={() => void issue()}>
          {busy ? t('making') : t('make', { title })}
        </button>
      )}
      {error ? (
        <p className="pf-error pf-kept" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
