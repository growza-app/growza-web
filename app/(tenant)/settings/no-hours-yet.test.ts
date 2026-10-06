import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import type { SettingsSummary } from '../lib/api';
import { BranchScopeNote } from './BranchScopeNote';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

/**
 * GRW-516 QA — Settings said "MG Road uses the business's hours" when the business had none, so the branch had no
 * opening hours at all and the note told the owner the opposite.
 */
const settings = (over: { ownKeys?: string[]; workingHours?: SettingsSummary['workingHours'] }) =>
  ({
    scope: { locationId: 'mg', ownKeys: over.ownKeys ?? [] },
    branchCount: 2,
    workingHours: over.workingHours ?? [],
  }) as unknown as SettingsSummary;
const note = (s: SettingsSummary, locale: 'en' | 'hi' = 'en', topic: 'hours' | 'bookingRules' = 'hours') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      timeZone: 'Asia/Kolkata',
      children: createElement(BranchScopeNote, { settings: s, branchName: 'MG Road', keys: ['working_hours'], topic }),
    }),
  );
const day = { weekday: 1, startTime: '09:00', endTime: '18:00' };

describe('the branch note on Working hours', () => {
  it('says the branch has no hours yet when neither it nor the business has any', () => {
    const html = note(settings({}));
    expect(html).toContain('has no opening hours yet');
    expect(html).not.toContain('uses the business');
  });

  it('still says it uses the business hours when the business has some', () => {
    expect(note(settings({ workingHours: [day] }))).toContain('uses the business');
  });

  it('a branch with its own hours is unchanged', () => {
    expect(note(settings({ ownKeys: ['working_hours'], workingHours: [day] }))).toContain('has its own');
  });

  it('only the hours tab: other tabs keep their wording', () => {
    expect(note(settings({}), 'en', 'bookingRules')).toContain('uses the business');
  });

  it('reads in Hindi', () => {
    expect(note(settings({}), 'hi')).toContain('खुलने के घंटे तय नहीं हैं');
  });
});
