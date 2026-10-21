import type { ChannelConnection, ChannelOrdersLine } from './api-types';

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

/**
 * Jira GRW-624 — the line under a marketplace's keys that says how stock going out is doing, decided here so it can be tested without a
 * browser. One primary line, in the order an owner needs it: a refusal of the keys first (nothing will go until they are replaced), then
 * a problem on the last run, then the plain news — when it last went, or that it is waiting. Sizes that failed past the cap are a second,
 * separate line, because they are true whatever the last run said.
 */
export type StockLineKey = 'notYet' | 'refused' | 'unreadable' | 'slow' | 'unreachable' | 'updated' | 'waiting' | 'nothing';
export interface StockLine {
  primary: { key: StockLineKey; tone: 'idle' | 'ok' | 'bad'; count?: number; at?: string } | null;
  stuck: number;
}

export function stockLine(conn: Pick<ChannelConnection, 'saved' | 'canCheck' | 'stock'>): StockLine {
  const { stock } = conn;
  if (!conn.saved) return { primary: null, stuck: 0 };
  const stuck = stock.stuck;
  if (!conn.canCheck) return { primary: { key: 'notYet', tone: 'idle' }, stuck };
  switch (stock.lastRunReason) {
    case 'refused':
      return { primary: { key: 'refused', tone: 'bad' }, stuck };
    case 'keys_unreadable':
      return { primary: { key: 'unreadable', tone: 'bad' }, stuck };
    case 'unreachable':
      return { primary: { key: 'unreachable', tone: 'bad' }, stuck };
    case 'rate_limited':
      return { primary: { key: 'slow', tone: 'idle' }, stuck };
    default:
      break;
  }
  if (stock.lastPushedAt) return { primary: { key: 'updated', tone: 'ok', at: stock.lastPushedAt }, stuck };
  return { primary: stock.waiting > 0 ? { key: 'waiting', tone: 'idle', count: stock.waiting } : { key: 'nothing', tone: 'idle' }, stuck };
}

/**
 * Jira GRW-623 — the one line the Orders screen says about orders coming in from a marketplace, decided here so it can be tested without a
 * browser. Nothing at all until the marketplace's adapter exists (a line that says "no orders yet" about something nothing is asking for
 * would be a lie); then a problem if the last run had one, else when orders last came in, else that none have.
 */
export type BringInKey = 'updated' | 'nothing' | 'refused' | 'unreadable' | 'slow' | 'unreachable';
export function bringInLine(line: Pick<ChannelOrdersLine, 'canPull' | 'lastBroughtInAt' | 'lastRunReason'>): { key: BringInKey; tone: 'ok' | 'idle' | 'bad' } | null {
  if (!line.canPull) return null;
  switch (line.lastRunReason) {
    case 'refused':
      return { key: 'refused', tone: 'bad' };
    case 'keys_unreadable':
      return { key: 'unreadable', tone: 'bad' };
    case 'unreachable':
    case 'failed':
      return { key: 'unreachable', tone: 'bad' };
    case 'rate_limited':
      return { key: 'slow', tone: 'idle' };
    default:
      return line.lastBroughtInAt ? { key: 'updated', tone: 'ok' } : { key: 'nothing', tone: 'idle' };
  }
}

/** The buffer as typed: a whole number from 0 to 1000, or null. The server checks again; this only saves a round trip. */
export function parseBuffer(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 1000 ? n : null;
}
