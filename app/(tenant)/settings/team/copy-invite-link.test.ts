import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard } from '../../lib/copy-to-clipboard';

/**
 * The invite link is shown once, so "Copied" has to mean it was. The button used to fire the write and show
 * "Copied" without waiting for it — on an insecure origin or a refused permission nothing reached the clipboard and
 * the owner sent a link they did not have.
 */
const panel = readFileSync(resolve(__dirname, 'TeamAccessPanel.tsx'), 'utf8');
const en = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/en.json'), 'utf8')).settingsTeam;
const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../../messages/hi.json'), 'utf8')).settingsTeam;

const fakeDocument = (execCopy: boolean) => {
  const area = { value: '', style: { cssText: '' }, setAttribute: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn() };
  vi.stubGlobal('document', {
    createElement: vi.fn(() => area),
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
    execCommand: vi.fn(() => execCopy),
  });
  return area;
};

afterEach(() => vi.unstubAllGlobals());

describe('copyToClipboard says whether it copied', () => {
  it('is true when the clipboard write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyToClipboard('https://x/y')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x/y');
  });

  it('falls back to select-and-copy when the write is refused', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const area = fakeDocument(true);
    expect(await copyToClipboard('https://x/y')).toBe(true);
    expect(area.value).toBe('https://x/y');
  });

  it('falls back when there is no clipboard API at all (an insecure origin)', async () => {
    vi.stubGlobal('navigator', {});
    fakeDocument(true);
    expect(await copyToClipboard('abc')).toBe(true);
  });

  it('is false — not "copied" — when both routes fail', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    fakeDocument(false);
    expect(await copyToClipboard('abc')).toBe(false);
  });
});

describe('the invite banner', () => {
  it('waits for the copy before claiming it, and says so when it failed', () => {
    expect(panel).toMatch(/copyToClipboard\(linkFor\(created\.token\)\)\.then\(\(ok\) => \{\s*setCopied\(ok\);\s*setCopyFailed\(!ok\);/);
    expect(panel).not.toMatch(/navigator\.clipboard\?\.writeText\(linkFor/);
    expect(panel).toMatch(/\{copyFailed && \(\s*<div role="alert"[^>]*>\s*\{t\('copyFailed'\)\}/);
  });

  it('clears both states for the next invite', () => {
    expect(panel).toMatch(/setCopied\(false\);\s*setCopyFailed\(false\);/);
  });

  it('has the message in both languages', () => {
    expect(en.copyFailed).toBeTruthy();
    expect(hi.copyFailed).toBeTruthy();
  });
});
