'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconClose, IconMic } from './icons';
import {
  claimVoiceSession,
  extractVoiceTranscript,
  getSpeechRecognitionConstructor,
  releaseVoiceSession,
  setNativeInputValue,
  voiceSearchLang,
  type BrowserSpeechRecognition,
} from '../lib/voice-search';

/**
 * A small × inside a search box that empties it, and — when the box is empty and the browser has `SpeechRecognition`
 * (Jira GRW-651) — a microphone button that transcribes spoken words straight into the search box.
 *
 * Put it straight after the `<input type="search">`, inside the box's wrapper:
 * `<input … />` then `<SearchClear value={search} onClear={() => setSearch('')} />`.
 *
 * Shown only while there is text (or when voice search is supported), so an empty box on an unsupported browser looks
 * the same as before. The browser's own × is hidden next to it (26-search.css): Chrome drew one only on hover and
 * Firefox none, so the same box cleared differently per browser. After clearing, the cursor goes back into the box so
 * the next name can be typed straight away.
 */
function findSearchInput(btn: HTMLElement | null): HTMLInputElement | null {
  if (!btn) return null;
  if (btn.previousElementSibling instanceof HTMLInputElement) return btn.previousElementSibling;
  const fallback = btn.parentElement?.querySelector('input');
  return fallback instanceof HTMLInputElement ? fallback : null;
}

export function SearchClear({
  value,
  onClear,
  onVoice,
}: {
  value: string;
  onClear: () => void;
  onVoice?: (transcript: string) => void;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [denied, setDenied] = useState(false);
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setCanSpeak(getSpeechRecognitionConstructor() !== null);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const stopCurrent = () => {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      setListening(false);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') stopCurrent();
    };
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') stopCurrent();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [listening]);

  useEffect(() => {
    return () => {
      const rec = recRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
        recRef.current = null;
      }
    };
  }, []);

  if (!canSpeak && !listening) {
    if (value === '') return null;
  }

  if (value !== '' && !listening) {
    return (
      <button
        type="button"
        className="search-clear"
        aria-label={t('clearSearch')}
        onClick={(e) => {
          onClear();
          const box = findSearchInput(e.currentTarget);
          if (box) box.focus();
        }}
      >
        <IconClose />
      </button>
    );
  }

  const toggleVoice = (btn: HTMLButtonElement) => {
    if (listening && recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      setListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = voiceSearchLang(locale);
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const stopSession = () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      if (recRef.current === rec) recRef.current = null;
      setListening(false);
      releaseVoiceSession(stopSession);
    };

    claimVoiceSession(stopSession);
    recRef.current = rec;
    setDenied(false);
    setListening(true);

    rec.onresult = (event) => {
      const cleaned = extractVoiceTranscript(event.results);
      if (!cleaned) return;
      if (onVoice) {
        onVoice(cleaned);
      } else {
        const box = findSearchInput(btnRef.current ?? btn);
        if (box) setNativeInputValue(box, cleaned);
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setDenied(true);
      }
      if (recRef.current === rec) recRef.current = null;
      setListening(false);
      releaseVoiceSession(stopSession);
    };

    rec.onend = () => {
      if (recRef.current === rec) recRef.current = null;
      setListening(false);
      releaseVoiceSession(stopSession);
      const box = findSearchInput(btnRef.current ?? btn);
      if (box && box.value) box.focus();
    };

    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
      releaseVoiceSession(stopSession);
    }
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`search-mic${listening ? ' search-mic-listening is-listening' : ''}${denied ? ' search-mic-denied' : ''}`}
      aria-label={listening ? t('stopVoiceSearch') : denied ? t('voicePermissionDenied') : t('voiceSearch')}
      aria-pressed={listening}
      title={denied ? t('voicePermissionDenied') : listening ? t('voiceListening') : t('voiceSearch')}
      onClick={(e) => toggleVoice(e.currentTarget)}
    >
      <IconMic />
    </button>
  );
}
