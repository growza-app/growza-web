import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const code = (p: string) =>
  readFileSync(resolve(__dirname, p), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

/** Owner, 2026-11-26 (option A) — the phone till's way back to Home is the first word in its ⋮; Kitchen keeps its button. */
describe("the phone till's Back to Home", () => {
  const pos = code('PosClient.tsx');
  const flow = code('../appointments/new/PayFlow.tsx');
  const en = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/en.json'), 'utf8')).pos;
  const hi = JSON.parse(readFileSync(resolve(__dirname, '../../../messages/hi.json'), 'utf8')).pos;

  it('is first in the ⋮ on a phone, and Kitchen stays on the row', () => {
    expect(pos).toMatch(/items=\{\[\s*\.\.\.\(narrow \? \[\{ label: t\('backToHome'\), onSelect: backToHome \}\] : \[\]\),\s*\.\.\.\(canReturn/);
    expect(pos).toContain('className="btn btn-ghost pos-bar-kitchen"');
  });

  it('goes straight Home from an empty till, and asks first when a bill is being made', () => {
    expect(flow).toContain('homeRef.current = () => lines.length;');
    expect(pos).toMatch(/const n = homeRef\.current\?\.\(\) \?\? 0;\s*if \(n > 0\) setLeaveAsk\(n\);\s*else router\.push\('\/'\);/);
    expect(pos).toMatch(/<ConfirmDialog\s+title=\{t\('leaveOrderTitle'\)\}[\s\S]*?tone="danger"/);
  });

  it('says it in English and Hindi', () => {
    for (const k of ['backToHome', 'leaveOrderTitle', 'leaveOrderBody', 'leaveOrderConfirm', 'leaveOrderStay']) {
      expect(en[k], k).toBeTruthy();
      expect(hi[k], k).toBeTruthy();
    }
  });
});
