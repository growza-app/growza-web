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

  /*
   * Jira GRW-674 (SEC-05) — the cookie goes on under the name it came in.
   *
   * Production's session is `__Host-growza_session`; a plain `growza_session` there can only be one a sibling
   * host planted. Forwarding it under the plain name leaves the API to refuse it. Renaming it on the way
   * through would launder exactly the cookie the prefix exists to keep out.
   */
  it('forwards a host-locked session under its own name, and never promotes a plain one to it', () => {
    expect(serverSideHeaders({ token: 'abc', hostLocked: true })).toEqual({ cookie: '__Host-growza_session=abc' });
    expect(serverSideHeaders({ token: 'abc', hostLocked: false })).toEqual({ cookie: 'growza_session=abc' });
    expect(serverSideHeaders({ token: 'abc' })).toEqual({ cookie: 'growza_session=abc' });
  });
});
