import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Jira GRW-736 — fix: QA of the overnight stack (item 11). The phone's Back on /pos with a table's sheet open left the POS.
 * The sheet now has a history entry of its own while it is open: Back closes it; closing it any other way takes the entry
 * back off.
 */
const sheet = readFileSync(resolve(__dirname, 'TableBillSheet.tsx'), 'utf8');
const hookSrc = readFileSync(resolve(__dirname, '../lib/use-back-closes.ts'), 'utf8');

describe('Back closes the table sheet', () => {
  it('the table sheet uses the hook, closing the way its own button does', () => {
    expect(sheet).toContain("import { useBackCloses } from '../lib/use-back-closes';");
    expect(sheet).toContain('useBackCloses(() => onDone());');
  });

  it('pushes one entry that keeps the router’s own state, closes on popstate, and takes its entry back otherwise', () => {
    expect(hookSrc).toContain("window.history.pushState({ ...(window.history.state ?? {}), growzaSheet: true }, '');");
    expect(hookSrc).toMatch(/const onPop = \(\) => \{\s*ours = false;\s*close\.current\(\);\s*\};/);
    expect(hookSrc).toMatch(/if \(\(window\.history\.state as \{ growzaSheet\?: boolean \} \| null\)\?\.growzaSheet\) window\.history\.back\(\);/);
  });
});

describe('the hook, run against a stand-in history', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Back calls close; an unmount after that does not go back again', async () => {
    const listeners: Array<() => void> = [];
    const history = { state: null as unknown, pushState: vi.fn((s: unknown) => (history.state = s)), back: vi.fn() };
    vi.stubGlobal('window', { history, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: vi.fn() });
    const effects: Array<() => void | (() => void)> = [];
    vi.doMock('react', () => ({ useRef: <T,>(v: T) => ({ current: v }), useEffect: (f: () => void | (() => void)) => effects.push(f) }));
    const { useBackCloses } = await import('../lib/use-back-closes');
    const close = vi.fn();
    useBackCloses(close);
    const cleanup = effects[0]!() as () => void;
    expect(history.pushState).toHaveBeenCalledTimes(1);
    listeners[0]!();
    expect(close).toHaveBeenCalledTimes(1);
    cleanup();
    await new Promise((r) => setTimeout(r, 5));
    expect(history.back).not.toHaveBeenCalled();
    vi.doUnmock('react');
  });
});
