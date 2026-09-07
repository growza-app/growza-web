import { JoinForm } from './JoinForm';

export const dynamic = 'force-dynamic';

/**
 * Jira GRW-63 · GRW-67 — where an invited staff member arrives.
 *
 * Inside the `(auth)` group, and that placement is load-bearing for the same
 * reason `/login` is: `(tenant)/layout.tsx` calls `api.me()` on every render,
 * and this visitor has no session yet — under that layout they would be
 * bounced to `/login` before ever seeing the form.
 *
 * The preview is fetched by the FORM, not here on the server, so the token
 * never travels through a server-side fetch whose URL could be logged. It is a
 * credential; it stays in the browser that was handed it.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinForm token={token} />;
}
