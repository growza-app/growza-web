import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readBranchChoice, writeBranchChoice } from '../lib/branch-choice';
import { branchInAddress, oneBranchOnly } from '../lib/branch-routes';

/**
 * Jira GRW-395 — one branch picker, in the header, for every screen (it replaced GRW-340's per-screen tabs and
 * dropdowns).
 *
 * Checked in a browser with a three-branch owner, a receptionist and a stylist at 375px and 1000px. These pin the
 * rules a screenshot would not catch: what "remembered" means, that every screen follows the one choice, and which
 * screens offer "All".
 */
const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

const OPEN = [{ id: 'aaa' }, { id: 'bbb' }];

let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('the branch an owner is looking at', () => {
  it('is remembered, and read back while that branch is still open', () => {
    writeBranchChoice('bbb');
    expect(readBranchChoice(OPEN)).toBe('bbb');
  });

  it('reads as "All" (null) when nothing has been chosen', () => {
    expect(readBranchChoice(OPEN)).toBeNull();
  });

  it('reads as "All" when the remembered branch has since closed — never an empty branch', () => {
    writeBranchChoice('ccc');
    expect(readBranchChoice(OPEN)).toBeNull();
  });

  it('choosing "All" forgets the branch', () => {
    writeBranchChoice('aaa');
    writeBranchChoice(null);
    expect(readBranchChoice(OPEN)).toBeNull();
  });

  it('does not throw where storage is blocked — the choice just does not carry over', () => {
    (globalThis as { window?: unknown }).window = {
      get sessionStorage(): never {
        throw new Error('blocked');
      },
    };
    expect(readBranchChoice(OPEN)).toBeNull();
    expect(() => writeBranchChoice('aaa')).not.toThrow();
  });

  it('is a session choice, not a preference: a new visit starts on "All"', () => {
    expect(src('../lib/branch-choice.ts')).toContain('sessionStorage');
    expect(src('../lib/branch-choice.ts')).not.toMatch(/localStorage\./);
  });
});

describe('every screen follows the one choice', () => {
  const SCREENS = [
    'home/OwnerHome.tsx',
    '../appointments/BookingsList.tsx',
    '../attendance/AttendanceRegister.tsx',
    '../providers/StaffClient.tsx',
  ];

  it('the client-drawn screens read the SHARED choice and follow it whenever it moves', () => {
    for (const f of SCREENS) {
      const code = src(f);
      expect(code, f).toMatch(/useBranch\(\)/);
      expect(code, f).toMatch(/branchContext\.choice/);
      // Nothing reaches past the context into the browser's storage.
      expect(code, f).not.toMatch(/readBranchChoice|writeBranchChoice/);
    }
    for (const f of SCREENS.slice(0, 3)) {
      expect(src(f), f).toMatch(/\}, \[branchContext\.ready, branchContext\.choice\]\);/);
      expect(src(f), f).toMatch(/if \(!branchContext\.ready\) return;/);
    }
  });

  it('no screen draws a branch picker of its own any more', () => {
    for (const f of [
      ...SCREENS,
      '../customers/CustomersClient.tsx',
      '../services/ServicesTable.tsx',
      '../reports/ReportsShell.tsx',
      '../availability/page.tsx',
    ]) {
      const code = src(f);
      expect(code, f).not.toMatch(/<BranchTabs/);
      expect(code, f).not.toMatch(/className="hm-branch"|att-branch-menu|<select id="branch"/);
    }
    // Free times only carries the header's branch through its form.
    expect(src('../availability/page.tsx')).toMatch(/<input type="hidden" name="branch" value=\{branch\} \/>/);
  });

  it("Staff narrows its list in the browser, and counts each branch's own places (Jira GRW-557)", () => {
    const staff = src('../providers/StaffClient.tsx');
    // On a branch: its number against its own people. On "All": every branch's room added up.
    expect(staff).toMatch(/Math\.max\(0, \(places\[branchId\] \?\? maxProviders\) - activeAt\(branchId\)\)/);
    expect(staff).toMatch(/Object\.entries\(places\)\.reduce\(\(sum, \[branch, limit\]\) => sum \+ Math\.max\(0, limit - activeAt\(branch\)\), 0\)/);
    // An API without the per-branch numbers keeps the old business-wide count rather than showing nothing.
    expect(staff).toMatch(/Math\.max\(0, maxProviders - everyone\.filter\(\(p\) => p\.active\)\.length\)/);
    expect(staff).toMatch(/everyone\.filter\(\(p\) => p\.locationId === branchId\)/);
    // A new person is asked for a branch only on "All"; otherwise they join the header's.
    expect(src('../providers/StaffWizard.tsx')).toMatch(/branches\.length > 1 && branchContext\.choice === null \?/);
  });

  it('the walk-in sheet and staff wizard take the shared branch when it arrives, unless a chip was tapped (QA)', () => {
    for (const f of ['NewVisitSheet.tsx', '../providers/StaffWizard.tsx']) {
      const code = src(f);
      expect(code, f).toMatch(/if \(!branchContext\.ready \|\| branchTouched\.current/);
      expect(code, f).toMatch(/branchTouched\.current = true;/);
    }
  });

  it('address sync is for owners only, and Availability follows without setting it (QA)', () => {
    expect(src('BranchUrlSync.tsx')).toMatch(/const honoured = \(session\?\.role \?\? 'owner'\) === 'owner';/);
    expect(src('../availability/page.tsx')).toMatch(/<BranchUrlSync remember=\{false\} \/>/);
    expect(src('../offers/page.tsx')).toMatch(/<BranchUrlSync \/>/);
  });

  it('Bookings: an address that names a branch wins over the remembered one, on arrival', () => {
    const list = src('../appointments/BookingsList.tsx');
    expect(list).toMatch(/if \(initialBranch && initialBranch\.id !== branchContext\.choice\) \{\s*branchContext\.setBranch\(initialBranch\.id\);\s*return;/);
  });
});

describe('the header picker', () => {
  const picker = src('HeaderBranchPicker.tsx');

  it("is in every header: the laptop's controls, and the phone's line under the title", () => {
    expect(src('HeaderControls.tsx')).toMatch(/<HeaderBranchPicker \/>/);
    expect(src('PageHeader.tsx')).toMatch(/<HeaderBranchPicker variant="line" \/>/);
    expect(src('home/parts.tsx')).toMatch(/<HeaderBranchPicker \/>/);
    expect(src('../reports/ReportsShell.tsx')).toMatch(/<HeaderBranchPicker variant="line" \/>/);
    const css = src('../styles/94-header-branch-picker.css');
    expect(css).toMatch(/@media \(max-width: 860px\)\s*\{\s*\.hbp-pill\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/@media \(min-width: 861px\)\s*\{\s*\.hbp-line\s*\{\s*display:\s*none;/);
    // …and after the line's own `display`, which is just as specific: whichever comes later wins (QA found the
    // laptop showing both, the hiding rule placed first).
    expect(css.lastIndexOf('@media (min-width: 861px)')).toBeGreaterThan(css.indexOf('.hbp-line {'));
    expect(css.lastIndexOf('@media (max-width: 860px)')).toBeGreaterThan(css.indexOf('.hbp-line {'));
  });

  it('shows nothing at a one-branch business, and a fixed branch — no choice — to a receptionist or stylist', () => {
    expect(picker).toMatch(/if \(!branch\.multi \|\| wholeBusiness\(pathname\)\) return null;/);
    expect(picker).toMatch(/if \(branch\.pinned\) \{\s*return branch\.workBranchName \?/);
    expect(picker).toMatch(/className="sbp-btn is-branch hbp-fixed"/);
  });

  it('offers "All" only where a screen can show every branch', () => {
    expect(picker).toMatch(/\{oneOnly \? null : \(/);
    expect(oneBranchOnly('/services')).toBe(true);
    expect(oneBranchOnly('/availability')).toBe(true);
    expect(oneBranchOnly('/customers')).toBe(false);
    expect(oneBranchOnly('/')).toBe(false);
    expect(oneBranchOnly('/servicesx')).toBe(false);
  });

  it('writes the pick into the address of a screen the server draws from it, and "all" out loud', () => {
    expect(picker).toMatch(/next\.set\('branch', id \?\? ALL_BRANCHES_PARAM\);/);
    for (const route of ['/customers', '/services', '/reports', '/availability', '/offers']) expect(branchInAddress(route)).toBe(true);
    for (const route of ['/', '/appointments', '/attendance', '/providers']) expect(branchInAddress(route)).toBe(false);
  });

  it('is the header\u2019s own, and a branch name on the money card still picks through it', () => {
    /*
     * Jira GRW-485 \u2014 the card's "+N" used to open this picker, which answered a question
     * nobody asked: an owner tapping "+3" on a money line wants the other three numbers,
     * not another screen. It opens the card's own list of branch takings now, and a row in
     * THAT is what switches branch. The picker keeps its state and its other callers.
     */
    expect(src('home/OwnerHome.tsx')).not.toMatch(/onMoreBranches/);
    expect(src('home/OwnerHome.tsx')).toMatch(/onPickBranch=\{pickBranch\}/);
    expect(src('BranchProvider.tsx')).toMatch(/const \[pickerOpen, setPickerOpen\] = useState\(false\);/);
  });
});

/** Jira GRW-395 — what the QA pass on the Staff screen found. */
describe('Staff, as the QA pass left it', () => {
  it('a branch shows its own top performer, not the business’s', () => {
    expect(src('../providers/StaffClient.tsx')).toMatch(/\(branchId \? overview\.topByBranch\?\.\[branchId\] : overview\.topPerformer\)\?\.id/);
  });

  it('the wizard keeps unticked skills when the tab comes back and the page data refreshes', () => {
    expect(src('../providers/StaffWizard.tsx')).toMatch(/useEffect\(\(\) => setSkills\(new Set\(menu\.map\(\(s\) => s\.id\)\)\), \[menuKey\]\);/);
  });

  it('the edit screen loads a saved number as ten digits, so it can be saved again', () => {
    const edit = src('../providers/[id]/StaffEditClient.tsx');
    expect(edit).toMatch(/useState\(\(\) => fromStoredPhone\(detail\.phone\)\)/);
    expect(edit).toMatch(/phone !== fromStoredPhone\(detail\.phone\)/);
  });

  it('a stylist is offered their own branch’s menu only (Jira GRW-388: no skill is left at another branch)', () => {
    const edit = src('../providers/[id]/StaffEditClient.tsx');
    expect(edit).toMatch(/const menu = services\.filter\(\(s\) => !detail\.locationId \|\| s\.locationId === detail\.locationId\);/);
    expect(edit).not.toMatch(/skillLabel/);
  });

  /** Jira GRW-386 — a move sets their services itself; a skills save beside it raced the move and failed. */
  it('a move asks match-or-none, never saves skills beside it, and lists what had no match', () => {
    const edit = src('../providers/[id]/StaffEditClient.tsx');
    expect(edit).toMatch(/\.\.\.\(moving \? \{ locationId, skillsOnMove \} : \{\}\)/);
    expect(edit).toMatch(/if \(skillsDirty && !moving\) calls\.push\(api\.updateProviderServices/);
    expect(edit).toMatch(/disabled=\{moving\}/);
    expect(edit).toMatch(/t\('moveUnmatched'/);
  });
});

/** Jira GRW-395 — what the QA pass on layout and keyboard found. */
describe('the picker, as the layout pass left it', () => {
  const picker = src('HeaderBranchPicker.tsx');
  const css = src('../styles/94-header-branch-picker.css');

  it('is a disclosure — a list of buttons Tab walks — not an ARIA menu that ignores the arrow keys', () => {
    expect(picker).not.toMatch(/role="menu(itemradio)?"/);
    expect(picker).toMatch(/aria-current=\{shown\?\.id === b\.id \? 'true' : undefined\}/);
    // Tab past the last branch closes it.
    expect(picker).toMatch(/onBlur=\{\(e\) => \{\s*if \(open && !\(e\.relatedTarget instanceof Element && e\.relatedTarget\.closest\('\.hbp'\)\)\) setOpen\(false\);/);
  });

  it('hands focus back to the picker that is on screen, after Escape and after a pick', () => {
    expect(picker).toMatch(/\.find\(\(b\) => b\.getClientRects\(\)\.length > 0\);\s*shownButton\?\.focus\(\);/);
    expect(picker).toMatch(/const go = \(id: string \| null\) => \{\s*setOpen\(false\);\s*refocus\(\);/);
  });

  it('fits: scrolls inside a short screen, leaves Back tappable, and wraps a squeezed header instead of crushing the title', () => {
    expect(css).toMatch(/\.hbp \.sbp-menu \{\s*max-height: calc\(100dvh - 96px\);\s*overflow-y: auto;/);
    expect(css).toMatch(/\.topbar-title-row \{\s*position: relative;\s*z-index: 1;/);
    expect(css).toMatch(/\.topbar:has\(\.hbp-pill\) \.topbar-title \{\s*flex: 1 1 0;\s*min-width: 240px;/);
    expect(css).toMatch(/@media \(max-width: 340px\) \{\s*\.topbar \.topbar-lead:has\(\.hbp-line\) \{\s*min-width: 190px;/);
  });
});

describe('the header and the screen agree', () => {
  it('a screen drawn from its address names the address’s branch — a link to Koramangala’s free times says Koramangala', () => {
    const picker = src('HeaderBranchPicker.tsx');
    expect(picker).toMatch(/const inAddress = branchInAddress\(pathname\) \? params\.get\('branch'\) : null;/);
    expect(picker).toMatch(/const shownId =\s*addressed \?\?/);
  });
});
