import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFix } from './geo-fix';

/**
 * The 800 m bug: two stylists standing together, one sent to the owner for approval.
 *
 * `getCurrentPosition` answers with the FIRST position the browser produces. On Android that is the
 * wifi/cell estimate — fast, and wrong by the spacing of cell towers — while the GPS fix lands seconds
 * later and was thrown away. These tests hold `getFix` to the opposite rule: watch, keep the best, and
 * never answer with less than you were given.
 */

type SuccessFn = (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type ErrorFn = (err: { code: number; PERMISSION_DENIED: number }) => void;

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

const coords = (lat: number, lng: number, accuracy: number) => ({ coords: { latitude: lat, longitude: lng, accuracy } });

/** A geolocation that hands the test the callbacks, so a fix can be delivered whenever it likes. */
function stubGeolocation(opts: { deliverOnWatch?: () => void } = {}) {
  const cleared: number[] = [];
  let success: SuccessFn | undefined;
  let fail: ErrorFn | undefined;
  let options: PositionOptions | undefined;
  const geolocation = {
    watchPosition: (ok: SuccessFn, err: ErrorFn, o: PositionOptions) => {
      success = ok;
      fail = err;
      options = o;
      // A browser allowed to answer before `watchPosition` has even returned: the watch id is not yet
      // assigned, which is exactly the leak the implementation guards against.
      opts.deliverOnWatch?.();
      return 7;
    },
    clearWatch: (id: number) => cleared.push(id),
    getCurrentPosition: () => {
      throw new Error('getFix must not take the first fix the browser offers');
    },
  };
  vi.stubGlobal('navigator', { geolocation });
  return {
    cleared,
    optionsUsed: () => options,
    send: (lat: number, lng: number, accuracy: number) => success?.(coords(lat, lng, accuracy)),
    failWith: (code: number) => fail?.({ code, PERMISSION_DENIED }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getFix — the GPS fix beats the wifi fix that arrived first', () => {
  it('keeps watching after a coarse fix and answers with the precise one', async () => {
    const geo = stubGeolocation();
    const fix = getFix();
    geo.send(12.9716, 77.5946, 650); // the wifi estimate, 200 ms in
    geo.send(12.9718, 77.5949, 12); // GPS, seconds later
    await expect(fix).resolves.toEqual({ lat: 12.9718, lng: 77.5949, accuracyM: 12 });
  });

  it('stops watching once a fix is precise enough to settle any fence', async () => {
    const geo = stubGeolocation();
    const fix = getFix();
    geo.send(12.9718, 77.5949, 20);
    await fix;
    expect(geo.cleared).toEqual([7]);
  });

  /*
   * A branch may set radius 0 (migration 0111), and then the accuracy slack alone decides. So the
   * early stop has to be tighter than any fence: settling at 30 m would place a phone 30 m from the
   * pin that an arriving 8 m fix would have kept outside.
   */
  it('a 30 m fix is not precise enough to stop at, because a 0 m fence is decided by accuracy alone', async () => {
    vi.useFakeTimers();
    const geo = stubGeolocation();
    let settled = false;
    const fix = getFix(10_000).then((v) => {
      settled = true;
      return v;
    });
    geo.send(12.9716, 77.5946, 30);
    await Promise.resolve();
    expect(settled).toBe(false);
    geo.send(12.9718, 77.5949, 8);
    await expect(fix).resolves.toEqual({ lat: 12.9718, lng: 77.5949, accuracyM: 8 });
  });

  it('a fix delivered synchronously still clears its watch', async () => {
    const geo = stubGeolocation({ deliverOnWatch: () => geo.send(12.9718, 77.5949, 6) });
    await expect(getFix()).resolves.toEqual({ lat: 12.9718, lng: 77.5949, accuracyM: 6 });
    expect(geo.cleared).toEqual([7]);
  });

  it('does not settle on a coarse fix, however many arrive', async () => {
    vi.useFakeTimers();
    const geo = stubGeolocation();
    let settled = false;
    const fix = getFix(10_000).then((v) => {
      settled = true;
      return v;
    });
    geo.send(12.9716, 77.5946, 800);
    geo.send(12.9716, 77.5946, 700);
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(10_000);
    await expect(fix).resolves.toEqual({ lat: 12.9716, lng: 77.5946, accuracyM: 700 });
  });

  it('never asks for a cached position', () => {
    const geo = stubGeolocation();
    void getFix();
    expect(geo.optionsUsed()).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  });
});

describe('getFix — the answer when the phone cannot say', () => {
  it('a denied permission is final', async () => {
    const geo = stubGeolocation();
    const fix = getFix();
    geo.failWith(PERMISSION_DENIED);
    await expect(fix).resolves.toBeNull();
    expect(geo.cleared).toEqual([7]);
  });

  it('a provider that failed while GPS was still acquiring does not end the watch', async () => {
    const geo = stubGeolocation();
    const fix = getFix();
    geo.failWith(POSITION_UNAVAILABLE); // the network provider gave up
    geo.send(12.9718, 77.5949, 9); // GPS arrives anyway
    await expect(fix).resolves.toEqual({ lat: 12.9718, lng: 77.5949, accuracyM: 9 });
  });

  it('a basement with no GPS still answers with the coarse fix it was given, not null', async () => {
    vi.useFakeTimers();
    const geo = stubGeolocation();
    const fix = getFix(10_000);
    geo.send(12.9716, 77.5946, 900);
    vi.advanceTimersByTime(10_000);
    await expect(fix).resolves.toEqual({ lat: 12.9716, lng: 77.5946, accuracyM: 900 });
  });

  it('nothing at all before the timeout is null', async () => {
    vi.useFakeTimers();
    stubGeolocation();
    const fix = getFix(10_000);
    vi.advanceTimersByTime(10_000);
    await expect(fix).resolves.toBeNull();
  });

  it('a browser with no geolocation answers null without throwing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(getFix()).resolves.toBeNull();
  });

  it('a fix with no usable coordinates is ignored, not kept', async () => {
    vi.useFakeTimers();
    const geo = stubGeolocation();
    const fix = getFix(10_000);
    geo.send(Number.NaN, 77.5946, 10);
    vi.advanceTimersByTime(10_000);
    await expect(fix).resolves.toBeNull();
  });
});
