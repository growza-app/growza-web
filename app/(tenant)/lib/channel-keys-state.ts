import type { ChannelConnection } from './api-types';

/**
 * Jira GRW-621 — what the state line of a marketplace's keys says, decided in one place so it can be tested without a browser.
 *
 * "Connected" is a claim about the marketplace, so it needs a Check the marketplace ACCEPTED. Keys that are merely saved are
 * "saved, not checked yet" — never "connected": an owner who reads "Connected" will stop looking at why no order arrived.
 */
export type KeysState = { key: 'notConnected' | 'saved' | 'working' | 'refused' | 'unreachableLast'; tone: 'off' | 'idle' | 'ok' | 'bad' };

export function keysState(conn: Pick<ChannelConnection, 'saved' | 'lastCheck'>): KeysState {
  if (!conn.saved) return { key: 'notConnected', tone: 'off' };
  const last = conn.lastCheck;
  if (!last) return { key: 'saved', tone: 'idle' };
  if (last.ok) return { key: 'working', tone: 'ok' };
  return last.reason === 'rejected' ? { key: 'refused', tone: 'bad' } : { key: 'unreachableLast', tone: 'bad' };
}

/**
 * Whether the keys form may be offered. Not while the server cannot keep keys at all — but the saved fields and the state line are
 * always shown: keys that were saved before the server lost its encryption key are still saved.
 */
export const mayEditKeys = (conn: Pick<ChannelConnection, 'keysSetUp'>, writable: boolean): boolean => conn.keysSetUp && writable;
