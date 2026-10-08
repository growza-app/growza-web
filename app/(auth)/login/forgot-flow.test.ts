import { describe, expect, it, vi } from 'vitest';
import { confirmReset, requestCode, signInAfterReset } from './forgot-flow';

/** A fetch that answers one thing. */
const answering = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
const down = vi.fn(async () => {
  throw new TypeError('network down');
}) as unknown as typeof fetch;

const PHONE = '+919812345678';

describe('asking for a code', () => {
  it('posts the phone to the forgot-password route', async () => {
    const f = answering(200, { ok: true });
    expect(await requestCode(PHONE, 'en', f)).toEqual({ kind: 'sent' });
    const [url, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/forgot-password');
    expect(JSON.parse(init.body)).toEqual({ phone: PHONE });
  });

  it('sends a person to the support screen, with the number the API gave, when the pair is locked', async () => {
    const f = answering(429, { error: 'reset_locked', detail: 'x', support: { phone: '+919599420210' } });
    expect(await requestCode(PHONE, 'en', f)).toEqual({ kind: 'locked', supportPhone: '+919599420210' });
  });

  it('shows the API’s sentence for the ordinary rate limit — in Hindi on a Hindi page', async () => {
    const sentence = 'Too many attempts. Please wait a few minutes and try again.';
    const f = answering(429, { error: 'too_many_attempts', detail: sentence });
    expect(await requestCode(PHONE, 'en', f)).toEqual({ kind: 'error', message: sentence });
    expect(await requestCode(PHONE, 'hi', f)).toEqual({ kind: 'error', message: 'बहुत ज़्यादा कोशिशें हुईं। कृपया कुछ मिनट रुककर फिर कोशिश करें।' });
  });

  it('is "unreachable" when the request never lands, which is not the same as being refused', async () => {
    expect(await requestCode(PHONE, 'en', down)).toEqual({ kind: 'unreachable' });
  });

  it('has no sentence to show when the body is not JSON, and says so rather than inventing one', async () => {
    const f = vi.fn(async () => new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch;
    expect(await requestCode(PHONE, 'en', f)).toEqual({ kind: 'error', message: null });
  });
});

describe('confirming the code', () => {
  const input = { phone: PHONE, code: '123456', newPassword: 'a-new-password' };

  it('posts the phone, the code and the new password, and is done on a 200', async () => {
    const f = answering(200, { ok: true });
    expect(await confirmReset(input, 'en', f)).toEqual({ kind: 'done' });
    const [url, init] = (f as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/reset-password');
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it('carries the "not right, or expired" sentence, in Hindi on a Hindi page', async () => {
    const sentence = 'That code is not right, or it has expired. Ask for a new one.';
    const f = answering(400, { error: 'invalid_code', detail: sentence });
    expect(await confirmReset(input, 'en', f)).toEqual({ kind: 'error', message: sentence });
    expect(await confirmReset(input, 'hi', f)).toEqual({
      kind: 'error',
      message: 'यह कोड सही नहीं है, या इसकी समय-सीमा खत्म हो गई है। नया कोड मंगवाएँ।',
    });
  });

  it('goes to the support screen on the third wrong code (the API says reset_locked)', async () => {
    const f = answering(429, { error: 'reset_locked', support: { phone: '+919599420210' } });
    expect(await confirmReset(input, 'en', f)).toEqual({ kind: 'locked', supportPhone: '+919599420210' });
  });

  it('still reaches the support screen if the API leaves the number out — the screen words it without one', async () => {
    const f = answering(429, { error: 'reset_locked' });
    expect(await confirmReset(input, 'en', f)).toEqual({ kind: 'locked', supportPhone: null });
  });

  it('is "unreachable" on a network failure', async () => {
    expect(await confirmReset(input, 'en', down)).toEqual({ kind: 'unreachable' });
  });
});

describe('signing in with the password just chosen', () => {
  it('uses the ordinary sign-in route', async () => {
    const f = answering(200, { token: 't' });
    expect(await signInAfterReset(PHONE, 'a-new-password', 'en', f)).toEqual({ kind: 'in' });
    expect((f as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('/api/v1/auth/login');
  });

  it('shows what the sign-in route said when it refuses — a closed business, in Hindi on a Hindi page', async () => {
    const f = answering(403, { error: 'account_closed', detail: 'Phone number or password is incorrect.' });
    expect(await signInAfterReset(PHONE, 'x', 'hi', f)).toEqual({ kind: 'error', message: 'फ़ोन नंबर या पासवर्ड ग़लत है।' });
  });
});
