/**
 * Jira GRW-651 — free browser voice-to-text search (`SpeechRecognition` / `webkitSpeechRecognition`).
 *
 * No paid SDK, no audio upload: the browser's built-in speech recognizer turns spoken words into text locally/natively
 * and streams interim + final results into the search box.
 */

export interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

export interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionAlternative | undefined;
}

export interface BrowserSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: BrowserSpeechRecognitionResult | undefined;
}

export interface BrowserSpeechRecognitionEvent {
  readonly results: BrowserSpeechRecognitionResultList;
}

export interface BrowserSpeechRecognitionErrorEvent {
  readonly error: string;
}

export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

/**
 * Browser speech engines often end a spoken phrase with a trailing full stop, danda (`।`), comma or question mark
 * ("Butter chicken." or "बटर चिकन।"). Leaving that punctuation on a search query breaks exact prefix/code matching,
 * so we strip trailing sentence punctuation and collapse internal whitespace.
 */
export function cleanVoiceTranscript(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.।?!,;:]+\s*$/u, '')
    .trim();
}

/** Joins the segments of a `SpeechRecognitionEvent.results` list and cleans trailing sentence punctuation. */
export function extractVoiceTranscript(results: BrowserSpeechRecognitionResultList): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const alt = res?.[0];
    if (alt?.transcript) parts.push(alt.transcript);
  }
  return cleanVoiceTranscript(parts.join(' '));
}

/** Picks `hi-IN` when the dashboard is in Hindi, `en-IN` otherwise (Indian English accents & names). */
export function voiceSearchLang(locale: string): 'hi-IN' | 'en-IN' {
  return locale === 'hi' ? 'hi-IN' : 'en-IN';
}

/** Returns the browser's `SpeechRecognition` or `webkitSpeechRecognition` constructor, or `null` when unsupported. */
export function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Writes `nextValue` into a controlled React `<input>` element and dispatches a bubbling `'input'` event so React's
 * `onChange` handler runs even when the caller did not pass an explicit `onVoice` callback.
 */
export function setNativeInputValue(input: HTMLInputElement, nextValue: string): void {
  const proto = Object.getPrototypeOf(input) as HTMLInputElement | null;
  const descriptor =
    (proto ? Object.getOwnPropertyDescriptor(proto, 'value') : undefined) ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, nextValue);
  } else {
    input.value = nextValue;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

let activeStop: (() => void) | null = null;

/** Ensures only one search box in the tab is listening at a time. */
export function claimVoiceSession(stopFn: () => void): void {
  if (activeStop && activeStop !== stopFn) {
    try {
      activeStop();
    } catch {
      /* ignore already-stopped recognition */
    }
  }
  activeStop = stopFn;
}

export function releaseVoiceSession(stopFn: () => void): void {
  if (activeStop === stopFn) activeStop = null;
}
