'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { sendDocumentOnWhatsApp } from '../../lib/share-document';

/**
 * Jira GRW-582 · ADR-17 — a customer's document, and the four things an owner does with it.
 *
 * ## Why the document opens as its own page rather than inside this one
 *
 * It was built as an iframe first, which is the obvious shape: the API renders the document, the dashboard frames
 * it, one template and no second rendering. The dashboard answers `frame-ancestors 'none'`, so the browser refused
 * it — and that header is right. Weakening a clickjacking defence so an invoice could sit in a box would be trading
 * a real protection for a layout.
 *
 * So the document opens as what it is: a page of its own, at the API's own address, with nothing of the dashboard
 * around it. That is also the better answer for the two things people actually do with an invoice — printing it and
 * saving it — because the sheet that comes out carries no navigation, no buttons and no bottom bar, which is
 * exactly what the ADR asks for and what an iframe would have had to be careful about.
 *
 * This screen is then the chrome: what the document is, who it is for, what it came to, and the four actions.
 */
export function DocumentViewer({
  id,
  number,
  title,
  status,
  customerName,
  phone,
  amount,
  shareText,
}: {
  id: string;
  number: string;
  title: string;
  status: 'issued' | 'cancelled';
  customerName: string;
  phone: string | null;
  amount: string;
  shareText: string;
}) {
  const t = useTranslations('documents');
  const [note, setNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const href = `/api/v1/documents/${id}/html`;

  /** A link the customer opens with no account; valid a week, then the business sends a new one. */
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    setNote(null);
    try {
      await sendDocumentOnWhatsApp({
        id,
        phone,
        compose: (link, days) => `${shareText}\n${t('shareLine', { link, days })}`,
      });
    } catch (e) {
      setNote(e instanceof ApiError && e.status < 500 ? e.message : t('couldNotMake'));
    } finally {
      setSharing(false);
    }
  };

  /** Opens the document and asks that window to print itself, so the printed sheet is the document and nothing else. */
  const print = () => {
    const w = window.open(href, '_blank', 'noopener');
    if (!w) {
      // A blocked pop-up is not an error worth alarming anybody with: the Open button beside this one still works.
      setNote(t('popupBlocked'));
      return;
    }
    w.addEventListener('load', () => w.print(), { once: true });
  };

  const download = async () => {
    setNote(null);
    try {
      const res = await fetch(`/api/v1/documents/${id}/pdf`);
      if (!res.ok) {
        // A 503 carries the sentence worth reading: no renderer on this server, so print instead.
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setNote(body?.error ?? t('couldNotMake'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${number.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
      a.click();
      // Revoked: an object URL held for the life of the tab is a copy of the file kept in memory.
      URL.revokeObjectURL(url);
    } catch {
      setNote(t('couldNotMake'));
    }
  };

  return (
    <div className="doc-screen">
      <div className="card doc-card">
        <div className="card-body">
          <p className="doc-kind">{title}</p>
          <p className="doc-number">{number}</p>
          {status === 'cancelled' ? (
            <p className="doc-void" role="status">
              {t('cancelled')}
            </p>
          ) : null}
          <dl className="doc-facts">
            <div>
              <dt>{t('billedTo')}</dt>
              <dd>{customerName || '—'}</dd>
            </div>
            <div>
              <dt>{t('amount')}</dt>
              <dd className="doc-amount">{amount}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="doc-actions">
        <a className="btn" href={href} target="_blank" rel="noreferrer">
          {t('open')}
        </a>
        <button type="button" className="btn btn-ghost" onClick={print}>
          {t('print')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void download()}>
          {t('download')}
        </button>
        {status === 'issued' ? (
          <button type="button" className="btn btn-ghost" disabled={sharing} onClick={() => void share()}>
            {sharing ? t('sharing') : t('share')}
          </button>
        ) : null}
      </div>

      {note ? (
        <p className="field-hint" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
