import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import hi from '../../../messages/hi.json';
import { Pagination } from './Pagination';

/** Jira GRW-355 — the footer of every list, in both languages. */
function footer(locale: 'en' | 'hi', noun: string) {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: locale === 'en' ? en : hi,
      children: createElement(Pagination, { page: 2, total: 25, pageSize: 10, noun, onChange: () => {} }),
    }),
  );
}

describe('Pagination', () => {
  it('keeps the English footer word for word', () => {
    const html = footer('en', 'services');
    expect(html).toContain('Showing <strong>11–20</strong> of <strong>25</strong> services');
    expect(html).toContain('Page 2 of 3');
    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain('aria-label="Pagination"');
  });

  it('reads in Hindi, with the range still bold', () => {
    const html = footer('hi', 'सेवाएँ');
    expect(html).toContain('25 सेवाएँ में से <strong>11–20</strong> दिखा रहे हैं');
    expect(html).toContain('पेज 2 / 3');
    expect(html).toContain('aria-label="पिछला पेज"');
    expect(html).not.toMatch(/Showing|Page|Previous|Next/);
  });

  it('renders nothing for a single page', () => {
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: 'en',
        messages: en,
        children: createElement(Pagination, { page: 1, total: 5, pageSize: 10, noun: 'services', onChange: () => {} }),
      }),
    );
    expect(html).toBe('');
  });
});
