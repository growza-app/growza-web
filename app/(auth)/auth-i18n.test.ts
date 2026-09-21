import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { AUTH_MESSAGES } from '../../i18n/client-messages';
import { pickNamespaces, type Messages } from '../../i18n/messages';
import LoginPage from './login/page';
import { JoinForm } from './join/[token]/JoinForm';

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

describe('the invite page', () => {
  it('opens on "checking" in each language', () => {
    expect(page('en', createElement(JoinForm, { token: 't' }))).toContain('Checking your invite…');
    expect(page('hi', createElement(JoinForm, { token: 't' }))).toContain('आपका निमंत्रण जाँच रहे हैं…');
  });
});
