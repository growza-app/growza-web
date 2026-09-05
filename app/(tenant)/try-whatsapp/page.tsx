import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { ChatWindow } from './ChatWindow';
import { copy } from '../lib/copy';

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
      {/**
        * Jira GRW-158 · GRW-165 — in the SUBTITLE, not a banner in the body.
        *
        * This is the screen most easily mistaken for a live channel, because
        * everything on it works — so it has to say so. It said the wrong thing
        * to the wrong person: "until Meta approval is live" is developer-facing,
        * and an owner does not know what Meta approval is.
        *
        * A banner above the phone was the first attempt and was wrong twice
        * over: the page is fit-to-screen, so 65px of banner pushed the phone
        * past the bottom of its own region, and the region then scrolled to the
        * focused input and hid the banner. A caveat nobody can see is worse
        * than none, because it looks like due diligence was done.
        */}
      <PageHeader
        title="Try WhatsApp booking"
        subtitle={
          me.whatsapp?.booking
            ? 'A stand-in for real WhatsApp — same booking engine, same flow your customers get.'
            : copy.whatsapp.tryIsADemo
        }
      />
      <div className="page-body">
        <ChatWindow tenantName={me.tenant?.name ?? 'Your business'} />
      </div>
    </>
  );
}
