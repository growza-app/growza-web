import { localiseApiMessage } from '../../(tenant)/lib/api-messages';

/**
 * Jira GRW-561 — the three calls behind "Forgot password?", and what each answer means to the screen.
 *
 * Out of the component so the part that can go wrong — which answer is a wrong code, which is the support screen,
 * which is a network blip — is a function a test can drive, not a branch inside JSX. The component only draws.
 *
 * `message` is the API's own sentence, put into the page's language by the same table the rest of the dashboard
 * uses. It is `null` when there was nothing to say, and the component then supplies its own words.
 */
type Fetch = typeof fetch;

export type RequestOutcome =
  /** The API took the request. It answers the same for every number, so this does NOT mean a text was sent. */
  | { kind: 'sent' }
  /** Three wrong codes (or a later request after them): the person has to ring. */
  | { kind: 'locked'; supportPhone: string | null }
  | { kind: 'error'; message: string | null }
  | { kind: 'unreachable' };

export type ConfirmOutcome = { kind: 'done' } | Exclude<RequestOutcome, { kind: 'sent' }>;

export type SignInOutcome = { kind: 'in' } | { kind: 'error'; message: string | null } | { kind: 'unreachable' };

interface ErrorBody {
  error?: string;
  detail?: string;
  support?: { phone?: string };
}

async function bodyOf(res: Response): Promise<ErrorBody | null> {
  return (await res.json().catch(() => null)) as ErrorBody | null;
}

/** The two failures every call shares: the support screen, and an error to show. */
async function refusal(res: Response, lang: string): Promise<{ kind: 'locked'; supportPhone: string | null } | { kind: 'error'; message: string | null }> {
  const body = await bodyOf(res);
  if (body?.error === 'reset_locked') return { kind: 'locked', supportPhone: body.support?.phone ?? null };
  return { kind: 'error', message: body?.detail ? localiseApiMessage(body.detail, lang) : null };
}

const post = (f: Fetch, url: string, payload: unknown) =>
  f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export async function requestCode(phone: string, lang: string, f: Fetch = fetch): Promise<RequestOutcome> {
  let res: Response;
  try {
    res = await post(f, '/api/v1/auth/forgot-password', { phone });
  } catch {
    return { kind: 'unreachable' };
  }
  return res.ok ? { kind: 'sent' } : refusal(res, lang);
}

export async function confirmReset(
  input: { phone: string; code: string; newPassword: string },
  lang: string,
  f: Fetch = fetch,
): Promise<ConfirmOutcome> {
  let res: Response;
  try {
    res = await post(f, '/api/v1/auth/reset-password', input);
  } catch {
    return { kind: 'unreachable' };
  }
  return res.ok ? { kind: 'done' } : refusal(res, lang);
}

/**
 * Sign in with the password just chosen. The reset itself signs nobody in — it ends every session, this device's
 * included — so this is the ordinary sign-in route, with all of its checks: a closed business is refused here, with
 * its own message, rather than the reset page having to know about business status.
 */
export async function signInAfterReset(phone: string, password: string, lang: string, f: Fetch = fetch): Promise<SignInOutcome> {
  let res: Response;
  try {
    res = await post(f, '/api/v1/auth/login', { phone, password });
  } catch {
    return { kind: 'unreachable' };
  }
  if (res.ok) return { kind: 'in' };
  const body = await bodyOf(res);
  return { kind: 'error', message: body?.detail ? localiseApiMessage(body.detail, lang) : null };
}
