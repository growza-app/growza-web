import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  askForMicrophone,
  claimVoiceSession,
  cleanVoiceTranscript,
  extractVoiceTranscript,
  getSpeechRecognitionConstructor,
  releaseVoiceSession,
  voiceSearchLang,
  type BrowserSpeechRecognitionResultList,
} from './voice-search';

const tenant = join(__dirname, '..');
const read = (p: string) => readFileSync(join(tenant, p), 'utf8');

describe('voice-to-text transcript cleaning and language selection (Jira GRW-651)', () => {
  it('strips trailing sentence punctuation added by speech engines while keeping internal characters', () => {
    expect(cleanVoiceTranscript('Butter chicken.')).toBe('Butter chicken');
    expect(cleanVoiceTranscript('  बटर चिकन।  ')).toBe('बटर चिकन');
    expect(cleanVoiceTranscript('Paneer   tikka?!')).toBe('Paneer tikka');
    expect(cleanVoiceTranscript('O3+ Clean-up.')).toBe('O3+ Clean-up');
    expect(cleanVoiceTranscript('...')).toBe('');
  });

  it('joins multi-segment SpeechRecognitionResultList and cleans trailing punctuation', () => {
    const list: BrowserSpeechRecognitionResultList = {
      length: 2,
      0: { isFinal: true, length: 1, 0: { transcript: 'tandoori' } },
      1: { isFinal: false, length: 1, 0: { transcript: 'roti.' } },
    };
    expect(extractVoiceTranscript(list)).toBe('tandoori roti');
  });

  it('picks hi-IN for Hindi locale and en-IN otherwise', () => {
    expect(voiceSearchLang('hi')).toBe('hi-IN');
    expect(voiceSearchLang('en')).toBe('en-IN');
    expect(voiceSearchLang('en-IN')).toBe('en-IN');
  });

  it('stops a previous active voice session when a second search box claims the microphone', () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    claimVoiceSession(stopA);
    expect(stopA).not.toHaveBeenCalled();

    claimVoiceSession(stopB);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).not.toHaveBeenCalled();

    releaseVoiceSession(stopB);
  });
});

describe('POS and Menu search automatically ask the server for OpenAI embedding suggestions (Jira GRW-651)', () => {
  it.each([
    'appointments/new/DeskServiceGrid.tsx',
    'components/ServiceSheet.tsx',
    'products/ProductsList.tsx',
  ])('%s wires useServiceSuggestions and extraSuggestions', (file) => {
    const src = read(file);
    expect(src).toContain('useServiceSuggestions(');
    expect(src).toContain('extraSuggestions(');
    expect(src).toContain('also-try-chip');
  });
});

/**
 * QA 2026-10-26 — the microphone is not offered where it cannot work.
 *
 * A phone reaches a dev build over the LAN at `http://192.168.x.x:3020`, and the constructor exists there:
 * the button appeared, every tap failed, and the owner went looking for a Chrome permission that an
 * insecure origin is not even listed under. Their global "Sites can ask for mic" was on the whole time —
 * it lets a site ASK, and an http page is not allowed to. Production is https and is unaffected.
 */
describe('voice search needs a secure origin, not just the API', () => {
  const withContext = (secure: boolean, hasApi = true) => {
    vi.stubGlobal('window', {
      isSecureContext: secure,
      ...(hasApi ? { SpeechRecognition: function Rec() {} } : {}),
    });
    try {
      return getSpeechRecognitionConstructor();
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it('is offered on https and on localhost', () => {
    expect(withContext(true)).not.toBeNull();
  });

  it('is withheld on a plain-http origin even though the constructor is there', () => {
    expect(withContext(false)).toBeNull();
  });

  it('is still withheld on a browser that has no SpeechRecognition at all', () => {
    expect(withContext(true, false)).toBeNull();
  });
});

/**
 * QA 2026-10-28 — the app asks for the microphone, instead of telling the owner it is blocked.
 *
 * The owner's words: "the dialogue is not for allowing microphone, like allow location access". Nothing
 * here had ever called `getUserMedia`, which is the only thing that raises the browser's own prompt, so a
 * tap went straight to `SpeechRecognition.start()`, got `not-allowed`, and the app sent them to unblock a
 * permission they had never been asked for. On an installed PWA that is the ordinary case.
 */
describe('asking for the microphone', () => {
  const withMedia = (getUserMedia: unknown) => {
    const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
    const before = nav.mediaDevices;
    nav.mediaDevices = getUserMedia === undefined ? undefined : { getUserMedia };
    return () => {
      nav.mediaDevices = before;
    };
  };

  it('stops the track the moment permission arrives — this wants an answer, not a recording', async () => {
    const stop = vi.fn();
    const restore = withMedia(() => Promise.resolve({ getTracks: () => [{ stop }] }));
    try {
      await expect(askForMicrophone()).resolves.toBe('granted');
      // A microphone left open puts a recording indicator in the owner's status bar.
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it('reads a refusal as denied, which is the one case the "how to turn it on" note is for', async () => {
    const refuse = (name: string) => () => {
      const error = new Error(name);
      error.name = name;
      return Promise.reject(error);
    };
    for (const name of ['NotAllowedError', 'SecurityError']) {
      const restore = withMedia(refuse(name));
      try {
        await expect(askForMicrophone()).resolves.toBe('denied');
      } finally {
        restore();
      }
    }
  });

  /*
   * No microphone in the machine, and the page forbidden one by a Permissions-Policy, are the same answer:
   * it cannot open, and nothing the owner sets will change that.
   *
   * These two used to be `unavailable`, which meant "carry on and let SpeechRecognition have its own say" —
   * so the button went to "listening" against a device that could never open. QA 2026-10-28 found the second
   * of them live: `microphone=()` in next.config.ts forbade the page its own microphone on every origin,
   * production included, and the owner was looking at a mic that said it was listening.
   */
  it('calls a microphone that cannot open unusable, not merely unavailable', async () => {
    for (const name of ['NotFoundError', 'NotSupportedError']) {
      const restore = withMedia(() => {
        const error = new Error('none');
        error.name = name;
        return Promise.reject(error);
      });
      try {
        await expect(askForMicrophone(), name).resolves.toBe('unusable');
      } finally {
        restore();
      }
    }
  });

  /* An error that is none of the above stays `unavailable`: the recogniser gets its own say, as before. */
  it('leaves an unrecognised failure to the recogniser', async () => {
    const restore = withMedia(() => {
      const error = new Error('busy');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    try {
      await expect(askForMicrophone()).resolves.toBe('unavailable');
    } finally {
      restore();
    }
  });

  it('says so when the browser has no media stack at all', async () => {
    const restore = withMedia(undefined);
    try {
      await expect(askForMicrophone()).resolves.toBe('unavailable');
    } finally {
      restore();
    }
  });
});
