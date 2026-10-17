import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { screenTitle } from '../../lib/page-title';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { LoadErrorBanner } from '../../components/LoadErrorBanner';
import { loadErrorKind } from '../../lib/load-error';
import { guardScreen } from '../../lib/screen-guard';
import { DocumentViewer } from './DocumentViewer';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-582 — one customer document: a receipt, a bill of supply or a GST tax invoice.
 *
 * Guarded as `/sales`, because this is the same thing: a record of what a bill took. The desk that settled the bill
 * reaches its own document from the Done screen, and the owner reaches any of them from the register.
 *
 * The document is drawn by the API from the template the PDF is printed from; this page is the chrome around it.
 */
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await guardScreen('/sales');
  const { id } = await params;
  const t = await getTranslations('documents');

  let doc;
  try {
    doc = await api.document(id);
  } catch (error) {
    // A document that is not ours, or not there, is the same answer by design (AC-08) — so it is a 404 page here
    // rather than a banner that implies something went wrong.
    if (error instanceof ApiError && error.status === 404) notFound();
    return <LoadErrorBanner kind={loadErrorKind(error)} />;
  }

  const title = t(`type.${doc.docType}`);
  const money = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <>
      <PageHeader title={title} subtitle={doc.number} menu />
      <div className="page-body">
        <DocumentViewer
          id={doc.id}
          number={doc.number}
          title={title}
          status={doc.status}
          customerName={doc.customerName}
          amount={money(doc.grandTotalMinor)}
          phone={doc.customerPhone}
          /* What the customer reads in WhatsApp before they open anything: who, what, how much, and settled. */
          shareText={t('shareText', {
            business: doc.businessName,
            // "Tax invoice MU/…", not "tax invoice": the titles are lower-case for "Make {title}", and this is a sentence.
            title: title.charAt(0).toUpperCase() + title.slice(1),
            number: doc.number,
            amount: money(doc.grandTotalMinor),
          })}
        />
      </div>
    </>
  );
}

export const metadata = screenTitle('Document');
