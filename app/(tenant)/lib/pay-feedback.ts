/**
 * What a recorded payment sounds and feels like, and the phone's memory of whether it should (owner, 2026-10-10).
 *
 * Its own file because two screens record a payment — the three-tap flow on a phone (`PayFlow`) and the one-page
 * form (`NewVisitSheet`, `?full=1` and every desk) — and the owner's rule is that their done screens are the same
 * screen (`PaymentDone`). Moved here unchanged from PayFlow.
 */

/** Whether the done screen speaks: one setting for both forms, so turning it off on one turns it off on the other. */
export const SOUND_KEY = 'growza.pay.sound';

export function remembered(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the next sale just asks again */
  }
}

/**
 * How long each buzz lasts, in milliseconds (owner, 2026-10-10).
 *
 * A tick is the one confirmation that reaches somebody who is not reading the count on the tile: it says the tap
 * landed, without a word. So the taps made all day get the shortest buzz there is, and only the taps that CHANGE
 * something get one at all — a buzz on both adding and removing makes the two indistinguishable by feel, which is
 * worse than silence. The refusal is two short ones, because a disabled button has no other way to say no.
 */
export const BUZZ = {
  /** One more on the bill. 10ms: felt, not noticed. */
  added: 10,
  /** The bill is full. The only pattern, because a refusal must not feel like a success. */
  tooMany: [20, 40, 20],
  /** The tender tile — the tap that writes the sale and cannot be undone. */
  paid: 30,
  /** ③, beside the chime and the spoken amount. */
  done: 60,
} as const;

/**
 * A short buzz, where the phone has one.
 *
 * Android only: iOS Safari has never shipped `navigator.vibrate`, so about half the phones feel nothing. Nothing
 * here is ever the only signal — the tile still turns green, the count still changes, the total still moves.
 */
export function buzz(pattern: number | readonly number[]) {
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {
    /* a phone that refuses, or a browser without it: the screen still says it */
  }
}

/** Two short rising tones, drawn rather than loaded: the "payment received" of a sound box, without the box. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const at = ctx.currentTime;
    for (const [hz, start, len] of [
      [880, 0, 0.09],
      [1318, 0.1, 0.16],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at + start);
      gain.gain.exponentialRampToValueAtTime(0.25, at + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + start + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at + start);
      osc.stop(at + start + len + 0.05);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* no audio: the screen still says it */
  }
}

/** Whether this phone has the payment sound on. Defaults to on; only an explicit "off" turns it off. */
export function soundIsOn(): boolean {
  return remembered(SOUND_KEY) !== 'off';
}
