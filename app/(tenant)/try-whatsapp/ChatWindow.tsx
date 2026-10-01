'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, BookingConflictError, type ChatOption, type ChatState } from '../lib/api';

/**
 * A simulated WhatsApp thread driving the real conversation engine
 * (CNV-01/02) over `/api/v1/chat/*`. This is a stand-in CHANNEL only —
 * everything downstream (the flow interpreter, holds, confirm) is the real
 * booking engine. Swapping in the real Meta Cloud API adapter later touches
 * nothing here; this page just stops being useful once real WhatsApp works.
 */

interface Bubble {
  from: 'bot' | 'customer';
  text: string;
}

const DEFAULT_PHONE = '+91 98765 43210';

export function ChatWindow({ tenantName, branch }: { tenantName: string; /** Jira GRW-385 — a branch's link: start there. */ branch?: string }) {
  const t = useTranslations('tryWhatsApp.chat');
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [name, setName] = useState('Anjali Verma');
  const [state, setState] = useState<ChatState | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Options render right after the latest bubble, so scrolling on every
  // change (not just new bubbles) keeps the tappable choices in view —
  // exactly what a real WhatsApp thread does automatically.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [bubbles, state]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.chatStart(phone.trim(), name.trim() || undefined, branch);
      setState(next);
      setBubbles([{ from: 'bot', text: next.body }]);
    } catch {
      setError(t('unreachable'));
    } finally {
      setBusy(false);
    }
  };

  const tap = async (option: ChatOption) => {
    if (!state?.nonce || busy) return;
    setBusy(true);
    setError(null);
    setBubbles((prev) => [...prev, { from: 'customer', text: option.label }]);
    try {
      const next = await api.chatTap(phone.trim(), option.id, state.nonce);
      setState(next);
      setBubbles((prev) => [...prev, { from: 'bot', text: next.body }]);
    } catch (err) {
      if (err instanceof BookingConflictError) {
        setBubbles((prev) => [...prev, { from: 'bot', text: err.message }]);
      } else if (err instanceof ApiError && err.status === 404) {
        // The conversation is gone (expired from inactivity, or never
        // started) — those old options are dead, so land back on a fresh
        // menu instead of leaving them tappable-but-broken.
        setBubbles((prev) => [...prev, { from: 'bot', text: t('timedOut') }]);
        try {
          const fresh = await api.chatStart(phone.trim(), name.trim() || undefined, branch);
          setState(fresh);
          setBubbles((prev) => [...prev, { from: 'bot', text: fresh.body }]);
        } catch {
          setError(t('unreachable'));
        }
      } else {
        setError(t('wentWrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setState(null);
    setBubbles([]);
    setError(null);
  };

  return (
    <div className="wa-shell">
      <div className="wa-phone">
        <div className="wa-header">
          <div className="wa-avatar">{tenantName.charAt(0).toUpperCase()}</div>
          <div>
            <div className="wa-title">{tenantName}</div>
            <div className="wa-subtitle">{state ? t('online') : t('business')}</div>
          </div>
        </div>

        <div className="wa-body">
          {!state && (
            <div className="wa-system">{t('intro')}</div>
          )}
          {bubbles.map((b, i) => (
            <div key={i} className={`wa-bubble wa-bubble-${b.from}`}>
              {b.text.split('\n').map((line, j) => (
                <div key={j}>{line || ' '}</div>
              ))}
            </div>
          ))}
          {state?.status === 'awaiting_input' && state.options.length > 0 && (
            <div className={`wa-options wa-options-${state.type}`}>
              {state.options.map((o) => (
                <button key={o.id} className="wa-option" disabled={busy} onClick={() => tap(o)}>
                  <span className="wa-option-label">{o.label}</span>
                  {o.sublabel && <span className="wa-option-sublabel">{o.sublabel}</span>}
                </button>
              ))}
            </div>
          )}
          {state && (state.status === 'completed' || state.status === 'handoff') && (
            <button className="wa-option wa-option-restart" onClick={reset}>
              {t('newConversation')}
            </button>
          )}
          <div ref={bottomRef} />
        </div>

        {!state && (
          <div className="wa-composer">
            <input
              className="wa-input"
              placeholder={t('phone')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input className="wa-input" placeholder={t('name')} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={busy || !phone.trim()} onClick={start}>
              {busy ? t('starting') : t('start')}
            </button>
          </div>
        )}
      </div>

      {error && <div className="banner" style={{ marginTop: 16 }}>{error}</div>}
    </div>
  );
}
