import { JoinAdminForm } from './JoinAdminForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-164 — where an invited administrator arrives.
 *
 * The preview is fetched by the FORM rather than here on the server, so the
 * token never travels through a server-side fetch whose URL could be logged.
 * It is a credential — and this one buys the whole platform — so it stays in
 * the browser that was handed it.
 */
export default async function AdminJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinAdminForm token={token} />;
}
