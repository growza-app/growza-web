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
  /**
   * The instant the engine actually has the audio device open — QA 2026-11-05, and the whole reason this
   * exists. `start()` returning is NOT that instant: the browser then opens its own capture and connects
   * to its speech service, which on a phone is comfortably over a second. Until this fires the microphone
   * is deaf, so the button must not yet say "speak now". `onstart` is the weaker fallback (the session
   * began, audio may not be live); both are optional because not every engine declares them.
   */
  onaudiostart?: (() => void) | null;
  onstart?: (() => void) | null;
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

/**
 * Returns the browser's `SpeechRecognition` or `webkitSpeechRecognition` constructor, or `null` when voice
 * search cannot work here.
 *
 * QA 2026-10-26 — `isSecureContext` is half of that question and the half this forgot. The constructor
 * exists on a plain-http page; the microphone behind it does not. A dashboard opened over the LAN
 * (`http://192.168.x.x:3020`, which is how a phone reaches a dev build) therefore offered a microphone
 * button, failed on every tap, and sent the owner to look for a permission that Chrome does not list for an
 * insecure origin at all — there is no switch to find, so the advice was a wild goose chase.
 *
 * Secure means https, or localhost. Production is https and is unaffected; what changes is that the button
 * now stays away from the one place it could never have worked.
 */
export function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  if (!window.isSecureContext) return null;
  const w = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Ask the browser for the microphone, the way every other site asks — QA 2026-10-28.
 *
 * The owner's words: "the dialogue is not for allowing microphone, like allow location access". They were
 * right, and it was a real gap rather than a misunderstanding. Nothing in this app had ever called
 * `getUserMedia`, which is the ONLY thing that raises Chrome's own "Allow microphone?" prompt. The mic
 * button went straight to `SpeechRecognition.start()`, and when that answered `not-allowed` the app told
 * the owner their microphone was blocked and sent them into browser settings to unblock something they had
 * never been asked about.
 *
 * `start()` does not reliably raise the prompt — in an installed PWA on Android it commonly fails with
 * `not-allowed` while the permission is still in its untouched `prompt` state, because speech recognition
 * runs through the browser's own service rather than through the page's media stack.
 *
 * So the page asks first, in the tap's own turn, and the browser shows the prompt it shows for the camera
 * and for location. The track is stopped the instant it arrives: this asks for permission, it does not want
 * a recording, and a microphone left open puts a recording indicator in the owner's status bar.
 *
 * - `granted`  — carry on and start listening.
 * - `denied`   — they tapped Block, or had already; this is where the "how to turn it on" note belongs,
 *   because there IS a switch and only they can throw it.
 * - `unusable`  — the microphone cannot open and no setting of theirs will change that: a Permissions-Policy
 *   that forbids it (`NotSupportedError`), or no microphone in the machine (`NotFoundError`). QA 2026-10-28:
 *   this used to be folded into `unavailable`, so the button went to "listening" against a device that could
 *   never open — a lie on screen, and the one the owner was looking at. Sending them to Chrome's settings
 *   would be a second wild goose chase, so this says so and offers no switch.
 * - `unavailable` — no `mediaDevices` object at all (an old browser). The caller carries on to
 *   `SpeechRecognition` and lets it have its own say, which is what happened before this existed.
 */
/**
 * What the browser already knows about the microphone, without asking for it — QA 2026-11-05.
 *
 * `permissions.query({ name: 'microphone' })` is a read: it never prompts and never touches the device.
 * When it answers `granted` there is nothing left to ask, so `askForMicrophone` can skip opening and
 * closing a media stream it does not want. Safari has no `microphone` name and some browsers have no
 * Permissions API at all, hence `unknown` and the try/catch — the caller then does what it always did.
 */
export async function microphonePermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (typeof navigator === 'undefined') return 'unknown';
  const perms = (navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
  if (!perms?.query) return 'unknown';
  try {
    const res = await perms.query({ name: 'microphone' });
    if (res.state === 'granted' || res.state === 'denied' || res.state === 'prompt') return res.state;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function askForMicrophone(): Promise<'granted' | 'denied' | 'unusable' | 'unavailable'> {
  if (typeof navigator === 'undefined') return 'unavailable';
  /*
   * Already allowed? Then do not open the device and close it again just to be told so — QA 2026-11-05.
   *
   * The owner's words: "I need to speak after 2 seconds". This round trip was the first half of that gap.
   * It runs on EVERY tap, it acquires and releases the real microphone, and the speech engine then has to
   * acquire it a second time — on a phone that is most of a second, spent before anything is listening.
   * The prompt it exists to raise has already been answered here, so there is nothing to raise.
   */
  if ((await microphonePermissionState()) === 'granted') return 'granted';
  const media = navigator.mediaDevices as MediaDevices | undefined;
  if (!media?.getUserMedia) return 'unavailable';
  try {
    const stream = await media.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return 'granted';
  } catch (error) {
    const name = (error as DOMException | undefined)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    // Nothing the owner can set will open it: the page is forbidden the device, or there is no device.
    if (name === 'NotSupportedError' || name === 'NotFoundError') return 'unusable';
    return 'unavailable';
  }
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
