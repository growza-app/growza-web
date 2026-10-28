'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconClose, IconMic } from './icons';
import { ConfirmDialog } from './ConfirmDialog';
import {
  claimVoiceSession,
  extractVoiceTranscript,
  askForMicrophone,
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
  /** QA 2026-10-26 — the "how do I turn it on" popup, opened from the note and never by itself. */
  const [showHowTo, setShowHowTo] = useState(false);
  const recRef = useRef<BrowserSpeechRecognition | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setCanSpeak(getSpeechRecognitionConstructor() !== null);
  }, []);

  /*
   * QA 2026-10-26 — notice the moment they allow it, and put the microphone back without being asked.
   *
   * A page cannot re-open the browser's permission prompt: once somebody has tapped Block, `start()` fails
   * immediately and silently, and the same is true of geolocation — this is a browser rule, not something
   * the app chose. What the app CAN do is stop being wrong about it. Having told them where the switch is,
   * it watches that switch: they change it in the browser's own settings, come back to the tab, and the
   * warning clears itself rather than sitting there contradicting a microphone that now works.
   *
   * `navigator.permissions` and the `microphone` name are both optional in the wild (Safari has neither),
   * hence the try/catch and the silent return: without it the note simply stays until the next tap, which
   * is where this started.
   */
  useEffect(() => {
    if (!denied) return;
    let status: { state: string; onchange: (() => void) | null } | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const query = (navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<PermissionStatus> } }).permissions;
        if (!query) return;
        const result = (await query.query({ name: 'microphone' })) as unknown as { state: string; onchange: (() => void) | null };
        if (cancelled) return;
        status = result;
        const sync = () => {
          if (result.state === 'granted' || result.state === 'prompt') {
            setDenied(false);
            setShowHowTo(false);
          }
        };
        sync();
        result.onchange = sync;
      } catch {
        /* a browser without the Permissions API keeps the note until the next tap */
      }
    })();
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, [denied]);

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

  const toggleVoice = async (btn: HTMLButtonElement) => {
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

    /*
     * Ask for the microphone before trying to use it — QA 2026-10-28, and the owner's own words: "the
     * dialogue is not for allowing microphone, like allow location access".
     *
     * `start()` below does not raise Chrome's permission prompt; `getUserMedia` does, and nothing in this
     * app had ever called it. So a tap went straight to speech recognition, got `not-allowed` back, and the
     * owner was told their microphone was blocked and sent to unblock something nobody had asked them
     * about. On an installed PWA that is the ordinary case, not an edge one.
     *
     * `unavailable` carries on regardless: no media stack, no microphone in the machine, or an error that
     * is not about permission. `SpeechRecognition` then has its own say, exactly as it did before.
     */
    if ((await askForMicrophone()) === 'denied') {
      setDenied(true);
      setListening(false);
      return;
    }

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
    <>
      <button
        ref={btnRef}
        type="button"
        className={`search-mic${listening ? ' search-mic-listening is-listening' : ''}${denied ? ' search-mic-denied' : ''}`}
        aria-label={listening ? t('stopVoiceSearch') : denied ? t('voicePermissionDenied') : t('voiceSearch')}
        aria-pressed={listening}
        title={denied ? t('voicePermissionDenied') : listening ? t('voiceListening') : t('voiceSearch')}
        // The element is read in the handler's own turn: `currentTarget` is null by the time the await inside resolves.
        onClick={(e) => void toggleVoice(e.currentTarget)}
      >
        <IconMic />
      </button>
      {/*
        QA 2026-10-26 — say it in words, not in a colour, and give them somewhere to go.
        A blocked microphone turned the icon red and set `title`, and that was the whole of it: `title` never
        appears on a touch device, so an owner tapped the mic, a small shape changed shade, and they reported
        that voice search does not work. One short line now, because the steps belong in the popup behind
        "How to turn it on" rather than in a paragraph over the list they were reading.
        `role="status"` rather than `alert`: it is the answer to something they just did, not an interruption.
      */}
      {denied && (
        <p className="search-mic-note" role="status">
          <span>{t('voicePermissionDeniedHelp')}</span>
          <button type="button" className="search-mic-how" onClick={() => setShowHowTo(true)}>
            {t('voiceHowTo')}
          </button>
          {/* Dismissible: they have read it, they are going to type, and it should not sit on the list for the rest of the day. */}
          <button type="button" className="search-mic-note-x" aria-label={t('voiceNoteClose')} onClick={() => setDenied(false)}>
            <IconClose />
          </button>
        </p>
      )}
      {/*
        The popup the owner asked for. It is OURS and not the browser's, and it cannot be the browser's:
        once somebody has tapped Block there is no API that reopens that prompt — `start()` just fails. So
        this says where the switch is, says plainly that only they can throw it, and offers the retry that
        makes sense the moment they have.
      */}
      {showHowTo && (
        <ConfirmDialog
          title={t('voiceEnableTitle')}
          body={t('voiceEnableWhy')}
          confirmLabel={t('voiceTryAgain')}
          cancelLabel={t('voiceNoteClose')}
          onConfirm={() => {
            setShowHowTo(false);
            setDenied(false);
            const btn = btnRef.current;
            if (btn) void toggleVoice(btn);
          }}
          onCancel={() => setShowHowTo(false)}
        >
          {/*
            An <ol>, not a string with newlines in it: `voiceEnableSteps` rendered as a paragraph ran
            "...turn it on. 3. Come back here" onto one line, which is three steps that read as two.
            Split here so the numbers are the list's, and a translator writes sentences rather than layout.
          */}
          <ol className="search-mic-steps">
            {t('voiceEnableSteps')
              .split('\n')
              .map((step) => (
                <li key={step}>{step.replace(/^\d+\.\s*/, '')}</li>
              ))}
          </ol>
        </ConfirmDialog>
      )}
    </>
  );
}
