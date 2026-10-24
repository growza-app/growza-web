import { describe, expect, it } from 'vitest';
import { serverSideHeaders } from './api';

/**
 * Jira GRW-650 — what a server-side call to the API carries on the visitor's
 * behalf. The API's per-IP limiter keys on `X-Forwarded-For`; a render that
 * dropped it would charge every visitor's page loads to this container's
 * address — one bucket for the whole platform.
 */
describe('serverSideHeaders', () => {
  it('forwards the visitor address alongside the session cookie', () => {
    expect(serverSideHeaders({ token: 'abc', forwardedFor: '203.0.113.7' })).toEqual({
      cookie: 'growza_session=abc',
      'x-forwarded-for': '203.0.113.7',
    });
  });

  it('forwards the chain verbatim — Caddy put the real address last, and the API reads the last', () => {
    expect(serverSideHeaders({ token: 'abc', forwardedFor: '1.2.3.4, 203.0.113.7' })['x-forwarded-for']).toBe(
      '1.2.3.4, 203.0.113.7',
    );
  });

  it('sends nothing it does not have — no cookie without a session, no header without a proxy', () => {
    expect(serverSideHeaders({ token: 'abc', forwardedFor: null })).toEqual({ cookie: 'growza_session=abc' });
    expect(serverSideHeaders({ token: null, forwardedFor: '203.0.113.7' })).toEqual({ 'x-forwarded-for': '203.0.113.7' });
    expect(serverSideHeaders({})).toEqual({});
  });
});
