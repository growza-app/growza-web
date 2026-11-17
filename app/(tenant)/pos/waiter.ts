'use client';

import { createContext, useContext } from 'react';

/**
 * Jira GRW-723 — the till is in a waiter's hands: the room and a table's bill, nothing of the counter's (no takeaway or delivery, no Queue,
 * no returns, no printing the bill, no dish taken off, payment only once the counter has printed the bill). Set once by the POS page from the
 * member's role, read where the till draws those controls. The API refuses each of them on its own; this only leaves them undrawn.
 */
export const WaiterContext = createContext(false);

export const useWaiter = (): boolean => useContext(WaiterContext);
