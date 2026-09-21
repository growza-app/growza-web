import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { AttendanceRegister as Register } from '../lib/api';
import { AttendanceRegister } from './AttendanceRegister';
import { AttendanceMonth } from './[providerId]/AttendanceMonth';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/** Jira GRW-359 — the register and a person's month render in both languages. */
const wrap = (locale: 'en' | 'hi', child: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : hi, timeZone: 'Asia/Kolkata', children: child }),
  );

const row = (over: Record<string, unknown> = {}) => ({
  providerId: 'p1', displayName: 'Priya Sharma', title: null, rostered: true, shiftStart: '09:00', status: 'late',
  inAt: '2026-09-21T04:30:00.000Z', outAt: null, note: null, onDate: '2026-09-21', markedByName: 'Owner', markedAt: '2026-09-21T05:00:00.000Z', ...over,
});
const register = { date: '2026-09-21', today: '2026-09-21', timezone: 'Asia/Kolkata', lateGraceMin: 5, rows: [row(), row({ providerId: 'p2', displayName: 'Anil', status: null, inAt: null, rostered: false })] } as unknown as Register;

describe('the attendance register', () => {
  const page = (l: 'en' | 'hi') => wrap(l, createElement(AttendanceRegister, { initial: register, staffWord: 'Staff', branches: [] }));
  it('keeps the English words', () => {
    const html = page('en');
    for (const s of ['Staff attendance', 'Came late', 'Mark all present', 'Search staff by name or role', 'In time', 'Out time', 'Mark status', 'Not rostered', 'In progress', '0 of 2 staff marked'.replace('0', '1')]) expect(html, s).toContain(s);
  });
  it('reads in Hindi', () => {
    const html = page('hi');
    for (const s of ['स्टाफ़ की हाज़िरी', 'देर से आए', 'सबको उपस्थित करें', 'आने का समय', 'जाने का समय', 'स्थिति चुनें', 'आज ड्यूटी नहीं', 'चल रहा है']) expect(html, s).toContain(s);
    for (const s of ['Staff attendance', 'Came late', 'Mark all present', 'In progress', 'Times shown']) expect(html, s).not.toContain(s);
  });
});

describe('a month', () => {
  const month = (l: 'en' | 'hi') =>
    wrap(l, createElement(AttendanceMonth, { register: { ...register, rows: [row(), row({ onDate: '2026-09-22', status: null })] } as unknown as Register, month: '2026-09', readOnly: false, backHref: '/attendance' }));
  it('names the month and the weekdays in the language', () => {
    expect(month('en')).toContain('September 2026');
    expect(month('en')).toContain('Sun');
    expect(month('hi')).toContain('सितंबर 2026');
    expect(month('hi')).toContain('रवि');
    expect(month('hi')).toContain('‹ सभी स्टाफ़');
    expect(month('hi')).not.toMatch(/Hours worked|Not recorded|Day off/);
  });
});
