import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ChatWindow } from './ChatWindow';

export const dynamic = 'force-dynamic';

/** A local stand-in for the real WhatsApp channel (FND-04, pending Meta approval) — proves the booking flow customers will actually use. */
export default async function TryWhatsAppPage() {
  let me;
  try {
    me = await api.me();
  } catch {
    return (
      <>
        <PageHeader title="Try WhatsApp booking" />
        <div className="page-body">
          <div className="banner">
            <strong>Cannot reach the server.</strong> Ask your developer to start it, or run <code>npm run dev</code>.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Try WhatsApp booking"
        subtitle="A stand-in for real WhatsApp — same booking engine, until Meta approval is live."
      />
      <div className="page-body">
        <ChatWindow tenantName={me.tenant?.name ?? 'Your business'} />
      </div>
    </>
  );
}
