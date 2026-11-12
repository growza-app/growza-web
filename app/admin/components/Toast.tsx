'use client';

import { AdminApiError } from '../lib/api';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Jira GRW-704 — a short message after a change, with Undo where a change can be undone.
 *
 * Switches on a business used to save with nothing on screen to say it worked, and a mis-tap meant finding the switch
 * again and filling in another reason. One message at a time, bottom-centre above the tab bar, for 6 seconds (paused
 * while a pointer or focus is on it). Announced politely to screen readers. Undo runs once, then the message goes.
 */
export const TOAST_MS = 6000;

export interface ToastInput {
  message: string;
  /** Present only when the change can be reversed. */
  undo?: () => Promise<void> | void;
  tone?: 'ok' | 'error';
}

interface ToastValue {
  show: (t: ToastInput) => void;
}

const ToastCtx = createContext<ToastValue | null>(null);

/** Outside a provider (a test, a screen mounted alone) a toast is simply not shown. */
export function useToast(): ToastValue {
  return useContext(ToastCtx) ?? { show: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const [held, setHeld] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const seq = useRef(0);

  const show = useCallback((t: ToastInput) => {
    seq.current += 1;
    setUndoing(false);
    setToast({ ...t, id: seq.current });
  }, []);

  useEffect(() => {
    if (!toast || held || undoing) return;
    const timer = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, held, undoing]);

  const runUndo = async () => {
    if (!toast?.undo || undoing) return;
    setUndoing(true);
    try {
      await toast.undo();
      setToast(null);
    } catch (err) {
      // Someone else changed it since (409): say so, and that it was left as they set it — not "change it back by hand",
      // which would tell this admin to overwrite them.
      const changedSince = err instanceof AdminApiError && err.code === 'changed_since';
      setToast({ id: toast.id + 1, message: changedSince ? err.message : 'Could not undo that. Change it back by hand.', tone: 'error' });
    } finally {
      setUndoing(false);
    }
  };

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div aria-live="polite" role="status" className="admin-toast-region">
        {toast ? (
          <div
            className="admin-toast"
            data-tone={toast.tone ?? 'ok'}
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
          >
            <span className="admin-toast-text">{toast.message}</span>
            {toast.undo ? (
              <button type="button" className="admin-toast-undo" onClick={runUndo} disabled={undoing}>
                {undoing ? 'Undoing…' : 'Undo'}
              </button>
            ) : null}
            <button type="button" className="admin-toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>
              ×
            </button>
          </div>
        ) : null}
      </div>
    </ToastCtx.Provider>
  );
}
