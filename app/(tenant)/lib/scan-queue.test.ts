import { describe, expect, it } from 'vitest';
import { queueScan, SCAN_QUEUE_MAX, SCAN_QUEUE_TTL_MS, takeScans } from './scan-queue';

const memory = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
};

describe('scan queue', () => {
  it('keeps every scan, in the order scanned, and empties on take', () => {
    const s = memory();
    queueScan('A111', 1000, s);
    queueScan('B222', 1100, s);
    queueScan('A111', 1200, s);
    expect(takeScans(1300, s)).toEqual(['A111', 'B222', 'A111']);
    expect(takeScans(1300, s)).toEqual([]);
  });

  it('drops a scan that never arrived once it is a minute old', () => {
    const s = memory();
    queueScan('OLD1', 0, s);
    queueScan('NEW1', SCAN_QUEUE_TTL_MS, s);
    expect(takeScans(SCAN_QUEUE_TTL_MS + 1, s)).toEqual(['NEW1']);
  });

  it('keeps only the newest when a runaway fills it', () => {
    const s = memory();
    for (let i = 0; i < SCAN_QUEUE_MAX + 5; i++) queueScan(`C${i}`.padEnd(5, '0'), 10, s);
    const got = takeScans(10, s);
    expect(got).toHaveLength(SCAN_QUEUE_MAX);
    expect(got.at(-1)).toBe(`C${SCAN_QUEUE_MAX + 4}`.padEnd(5, '0'));
  });

  it('survives storage that is missing, full or holds junk', () => {
    expect(queueScan('A111', 1, null)).toBe(false);
    expect(takeScans(1, null)).toEqual([]);
    const full = { ...memory(), setItem: () => { throw new Error('quota'); } } as Storage;
    expect(queueScan('A111', 1, full)).toBe(false);
    const junk = memory();
    junk.setItem('growza.scanQueue', '{not json');
    expect(takeScans(1, junk)).toEqual([]);
    junk.setItem('growza.scanQueue', '{"a":1}');
    expect(takeScans(1, junk)).toEqual([]);
  });
});
