import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Security audit 2026-11-14 — the dashboard's half of five findings. Each one is pinned to the line that carries it, the
 * way this repo pins behaviour it does not want to lose in a refactor.
 */
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const en = JSON.parse(read('../../../messages/en.json'));
const hi = JSON.parse(read('../../../messages/hi.json'));

describe('#3 — a manager refunds the way the bill was paid, and says why a unit is written off', () => {
  const sheet = read('../sales/ReturnProductSheet.tsx');
  it('offers only the bill’s own ways to anyone but the owner, and needs a reason for a write-off', () => {
    expect(sheet).toContain("const offeredRefundModes = viewerIsOwner || paidWays.length === 0 ? REFUND_MODES : REFUND_MODES.filter((m) => paidWays.includes(m));");
    expect(sheet).toContain('{offeredRefundModes.map((m) => (');
    expect(sheet).toContain('const needsWriteOffReason = !viewerIsOwner && counted && !restock && reasonCode === null;');
    expect(sheet).toMatch(/disabled=\{totalSelectedUnits <= 0 \|\| !mayReturnBill \|\| busy \|\| \(reasonCode === 'other' && !reason\.trim\(\)\) \|\| needsWriteOffReason\}/);
    expect(en.sales.returnSheet.whyWriteOffNeeds).toBeTruthy();
    expect(hi.sales.returnSheet.whyWriteOffNeeds).toBeTruthy();
  });
});

describe('#4 — a correction under an issued document asks first', () => {
  const sheet = read('../components/CorrectBookingSheet.tsx');
  it('shows the document and offers "Correct anyway", which resends with the acknowledgement', () => {
    expect(sheet).toContain("if (err instanceof ApiError && err.code === 'document_issued') {");
    expect(sheet).toContain('onClick={() => void save(true)}');
    expect(sheet).toContain('...(acknowledgeIssuedDocument ? { acknowledgeIssuedDocument: true } : {}),');
    expect(read('../lib/api.ts')).toContain('confirmLargeAmount?: boolean; acknowledgeIssuedDocument?: boolean }');
    expect(en.chrome.correct.documentIssuedGo).toBe('Correct anyway');
    expect(hi.chrome.correct.documentIssuedGo).toBeTruthy();
    expect(en.chrome.correct.documentIssuedBody).toContain('{number}');
    expect(hi.chrome.correct.documentIssuedBody).toContain('{number}');
  });
});

describe('#10 — voice search says where the audio goes', () => {
  it('on the control that starts it, in both languages', () => {
    expect(read('../components/SearchClear.tsx')).toContain("t('voiceSearchWhere')");
    expect(en.common.voiceSearchWhere).toContain('speech service');
    expect(hi.common.voiceSearchWhere).toBeTruthy();
  });
});

describe('#14 — signing out forgets the people this tab remembered', () => {
  it('clears the remembered client and the held bills from sessionStorage before leaving', () => {
    const src = read('../lib/sign-out.ts');
    expect(src).toContain("if (key.startsWith('wa-booking:') || key.startsWith('growza.heldBills.')) sessionStorage.removeItem(key);");
    expect(src.indexOf('sessionStorage.removeItem')).toBeLessThan(src.indexOf('window.location.assign(SIGN_IN_PATH)'));
  });
});

describe('#19 — a 500 says its reference', () => {
  it('appends the request id the API now sends', () => {
    expect(read('../lib/api.ts')).toContain("(ref && res.status >= 500 ? ` (ref ${ref})` : '')");
  });
});
