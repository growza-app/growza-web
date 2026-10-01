import { describe, expect, it } from 'vitest';
import { loadAtBranch } from './branch-load';

/**
 * Jira GRW-397 — Clients and Offers ask for their data alongside `/me`, and ask again only when `/me` says the
 * branch they guessed was not the one to show.
 */

const branches = [
  { id: 'b-main', name: 'MG Road' },
  { id: 'b-two', name: 'Indiranagar' },
];
const owner = { branches, member: { role: 'owner', locationId: null } };
const desk = { branches: [branches[1]!], member: { role: 'receptionist', locationId: 'b-two' } };

function recorder(fail: (branch: string | null) => boolean = () => false) {
  const asked: Array<string | null> = [];
  const load = (branch: string | null) => {
    asked.push(branch);
    return fail(branch) ? Promise.reject(new Error('refused')) : Promise.resolve(`data:${branch ?? 'all'}`);
  };
  return { asked, load };
}

describe('loadAtBranch', () => {
  it('the branch in the address is loaded once, at the same time as /me', async () => {
    const r = recorder();
    const out = await loadAtBranch('b-two', Promise.resolve(owner), r.load);
    expect(out.data).toBe('data:b-two');
    expect(out.branch?.choice).toBe('b-two');
    expect(r.asked).toEqual(['b-two']);
  });

  it('"all" and no branch are every branch, in one load', async () => {
    for (const wanted of ['all', undefined]) {
      const r = recorder();
      expect((await loadAtBranch(wanted, Promise.resolve(owner), r.load)).data).toBe('data:all');
      expect(r.asked).toEqual([null]);
    }
  });

  it('a closed or unknown branch in the address is loaded again as every branch', async () => {
    const r = recorder((b) => b === 'b-gone');
    const out = await loadAtBranch('b-gone', Promise.resolve(owner), r.load);
    expect(out.data).toBe('data:all');
    expect(r.asked).toEqual(['b-gone', null]);
  });

  it('a receptionist with no branch in the address is served their own in one load (the server holds them to it)', async () => {
    const r = recorder();
    const out = await loadAtBranch(undefined, Promise.resolve(desk), r.load);
    expect(out.branch?.choice).toBe('b-two');
    expect(r.asked).toEqual([null]);
  });

  it('a receptionist whose address names another branch is refused, then loaded at their own', async () => {
    const r = recorder((b) => b === 'b-main');
    const out = await loadAtBranch('b-main', Promise.resolve(desk), r.load);
    expect(out.data).toBe('data:b-two');
    expect(r.asked).toEqual(['b-main', 'b-two']);
  });

  it('with no /me (Offers treats it as optional), every branch', async () => {
    const r = recorder();
    const out = await loadAtBranch('b-two', Promise.resolve(null), r.load);
    expect(out.data).toBe('data:all');
    expect(out.branch).toBeNull();
  });
});
