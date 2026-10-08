import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { AUTH_MESSAGES } from '../../i18n/client-messages';
import { pickNamespaces, type Messages } from '../../i18n/messages';
import LoginPage from './login/page';
import { JoinForm } from './join/[token]/JoinForm';
import ForgotPassword from './login/ForgotPassword';
import { localiseApiMessage } from '../(tenant)/lib/api-messages';
import { fromDashboard } from '../(tenant)/lib/dashboard-root';

/**
 * Jira GRW-361 — the sign-in pages read from THEIR OWN provider, which carries only AUTH_MESSAGES.
 * Rendering through that exact subset is the test: a group the page reads but the subset lacks
 * would print a blank here, as it would on a phone.
 */
const page = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: pickNamespaces((locale === 'en' ? en : hi) as Messages, AUTH_MESSAGES), children: child }),
  );

describe('the sign-in page', () => {
  it('keeps the English words', () => {
    const html = page('en', createElement(LoginPage));
    for (const s of ['Sign in', 'Manage your bookings, staff and services.', 'Phone number', 'Password', 'Forgotten your password? Ask whoever set up your account.', 'English']) expect(html, s).toContain(s);
  });
  it('reads in Hindi, and still offers both languages by their own names', () => {
    const html = page('hi', createElement(LoginPage));
    for (const s of ['साइन इन', 'अपनी बुकिंग, स्टाफ़ और सेवाएँ संभालें।', 'फ़ोन नंबर', 'पासवर्ड', 'English', 'हिन्दी']) expect(html, s).toContain(s);
    for (const s of ['Manage your bookings', 'Phone number', 'Forgotten your password']) expect(html, s).not.toContain(s);
  });
  it('marks the current language as pressed', () => {
    expect(page('hi', createElement(LoginPage))).toMatch(/lang="hi" aria-pressed="true"/);
    expect(page('en', createElement(LoginPage))).toMatch(/lang="en" aria-pressed="true"/);
  });
});

/**
 * The sentences the API sends back for a failed sign-in. Hindi for both already existed in the dashboard's table, but
 * the form printed `body.detail` raw, so a Hindi-reading owner who mistyped a password was told so in English — on the
 * one screen where they are most likely to be confused already. Pinned from both ends: the table has the entries, and
 * the form actually looks them up.
 */
describe('a failed sign-in is answered in the language of the page', () => {
  it.each([
    ['Phone number or password is incorrect.', 'फ़ोन नंबर या पासवर्ड ग़लत है।'],
    ['Too many attempts. Please wait a few minutes and try again.', 'बहुत ज़्यादा कोशिशें हुईं। कृपया कुछ मिनट रुककर फिर कोशिश करें।'],
  ])('says %j in Hindi on a Hindi page, and unchanged in English', (sentence, hindi) => {
    expect(localiseApiMessage(sentence, 'hi')).toBe(hindi);
    expect(localiseApiMessage(sentence, 'en')).toBe(sentence);
  });

  it('passes a sentence it has no Hindi for through untouched rather than blanking it', () => {
    expect(localiseApiMessage('Something nobody translated.', 'hi')).toBe('Something nobody translated.');
  });

  it('is what the form uses for both of its failure messages (sign-in and first password)', () => {
    const form = readFileSync(fromDashboard('app/(auth)/login/page.tsx'), 'utf8');
    expect(form).toMatch(/localiseApiMessage\(body\.detail, locale\)/);
    expect(form.match(/localiseApiMessage\(/g)?.length, 'both setError sites').toBe(2);
    expect(form, 'no raw API sentence may reach setError').not.toMatch(/setError\(body\?\.detail \?\?/);
  });
});

/**
 * Jira GRW-561 — the forgot-password screens, in both languages, rendered through the sign-in pages' own message
 * subset. A key the component reads but `AUTH_MESSAGES` lacks would print blank here as it would on a phone.
 */
describe('forgot password', () => {
  const screen = (locale: 'en' | 'hi') => page(locale, createElement(ForgotPassword, { initialPhone: '', onBack: () => {} }));

  it('opens on the phone step, in English', () => {
    const html = screen('en');
    for (const s of ['Reset your password', 'Enter the phone number you sign in with. We will text you a code.', 'Send code', 'Back to sign in']) {
      expect(html, s).toContain(s);
    }
  });

  it('opens on the phone step, in Hindi, with nothing left in English', () => {
    const html = screen('hi');
    for (const s of ['अपना पासवर्ड रीसेट करें', 'कोड भेजें', 'साइन इन पर वापस जाएँ']) expect(html, s).toContain(s);
    for (const s of ['Reset your password', 'Send code', 'Back to sign in']) expect(html, s).not.toContain(s);
  });

  it('has the same keys in both languages, so no screen can be blank in one of them', () => {
    const keys = (o: unknown, prefix = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    const block = (m: unknown) => (m as { auth: { forgotPassword: unknown } }).auth.forgotPassword;
    expect(keys(block(hi)).sort()).toEqual(keys(block(en)).sort());
  });

  it('carries the support number into the sentence rather than hard-coding one', () => {
    const phone = (m: unknown) => (m as { auth: { forgotPassword: { locked: { call: string } } } }).auth.forgotPassword.locked.call;
    expect(phone(en)).toContain('{phone}');
    expect(phone(hi)).toContain('{phone}');
  });
});

/** The sentences the API sends back from the reset routes. Each has to read in Hindi, or a Hindi page shows English. */
describe('every sentence the reset routes send has a Hindi', () => {
  it.each([
    'That code is not right, or it has expired. Ask for a new one.',
    'Phone number is required.',
    'Phone number, the code and a new password are all required.',
    'Choose a password of at least 8 characters.',
    'That password does not meet the requirements.',
    'Could not reach the sign-in service. Please try again shortly.',
    'Too many attempts. Please wait a few minutes and try again.',
    'Resetting a password here is not available yet. Please contact Growza support.',
    'We could not reset your password here. Please contact Growza support.',
  ])('%s', (sentence) => {
    expect(localiseApiMessage(sentence, 'hi')).not.toBe(sentence);
  });
});

describe('the invite page', () => {
  it('opens on "checking" in each language', () => {
    expect(page('en', createElement(JoinForm, { token: 't' }))).toContain('Checking your invite…');
    expect(page('hi', createElement(JoinForm, { token: 't' }))).toContain('आपका निमंत्रण जाँच रहे हैं…');
  });
});
