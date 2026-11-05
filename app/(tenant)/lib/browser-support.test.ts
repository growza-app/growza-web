import { describe, expect, it } from 'vitest';
import { MINIMUM, SUPPORT_PROBE, SUPPORT_SYNTAX, UNSUPPORTED_COPY } from './browser-support';

/**
 * Jira GRW-197 — the floor tracks the build, not a comment.
 *
 * AC-03: *"Given Next.js is upgraded and its modern target moves, when the test
 * suite runs, then a test comparing the detector's floor against
 * MODERN_BROWSERSLIST_TARGET fails if the two have drifted apart."*
 *
 * Without this, `MINIMUM` is a number somebody wrote down once. The whole
 * reason this feature exists is that a version floor moved silently and nobody
 * found out until a salon owner tapped a dead button on an iPad.
 */

describe('the floor comes from Next, not from memory', () => {
  it('matches MODERN_BROWSERSLIST_TARGET', async () => {
    const constants = await import('next/dist/shared/lib/constants.js');
    const target = constants.MODERN_BROWSERSLIST_TARGET as string[];

    // e.g. ['chrome 111', 'edge 111', 'firefox 111', 'safari 16.4']
    const floor = Object.fromEntries(
      target.map((entry) => {
        const [browser, version] = entry.split(' ');
        return [browser, version];
      }),
    );

    expect(
      floor,
      '\nNext.js has moved its browser target. Update MINIMUM in browser-support.ts to match,\n' +
        'and check the probe still tests syntax the new floor actually gates.\n',
    ).toMatchObject({
      safari: MINIMUM.safari,
      chrome: MINIMUM.chrome,
      edge: MINIMUM.edge,
      firefox: MINIMUM.firefox,
    });
  });
});

describe('the probe can run where the app cannot', () => {
  it('contains no syntax newer than ES5', () => {
    // BR-03: a guard written in the syntax it guards against is not a guard.
    // These are the constructs that would break on the browsers this detects.
    expect(SUPPORT_PROBE).not.toMatch(/=>/);
    expect(SUPPORT_PROBE).not.toMatch(/\b(const|let)\b/);
    expect(SUPPORT_PROBE).not.toMatch(/`/);
    expect(SUPPORT_PROBE).not.toMatch(/\?\./);
    expect(SUPPORT_PROBE).not.toMatch(/\?\?/);
  });

  it('tests the class static block — the construct that actually breaks', () => {
    // Not a user-agent string: that can be spoofed, frozen, or simply
    // unfamiliar, and a version comparison against it is a guess. This is the
    // exact syntax found in Next's own runtime chunk — written out, so the
    // browser's own parser is what answers.
    expect(SUPPORT_SYNTAX).toContain('static{}');
    expect(SUPPORT_SYNTAX).toContain('window.__growzaModern=1');
  });

  /*
   * Jira GRW-674 (SEC-04) — nothing is evaluated from a string.
   *
   * The probe was `try { new Function('class X{static{}}') } catch { mark }`. A script policy without
   * 'unsafe-eval' answers `new Function` with an EvalError, the catch took that for "cannot parse the
   * app", and every browser on earth would have been shown the too-old notice the day the policy
   * reached the tenant screens.
   */
  it('evaluates nothing from a string, so a script policy has nothing to refuse', () => {
    for (const script of [SUPPORT_SYNTAX, SUPPORT_PROBE]) {
      expect(script).not.toMatch(/new Function|\beval\(|setTimeout\(\s*['"`]/);
    }
  });

  it('marks the document and cannot throw doing it', () => {
    // A detector that throws takes out whatever runs after it. Reading a
    // missing property of `window` is the one thing every browser can do.
    expect(SUPPORT_PROBE).toContain('window.__growzaModern');
    expect(SUPPORT_PROBE).toContain('browser-too-old');
  });

  /** The two scripts as a browser runs them: each in its own element, a failed parse discarding the first whole. */
  const run = (parsesModernSyntax: boolean): string => {
    const windowStub: Record<string, unknown> = {};
    const documentStub = { documentElement: { className: '' } };
    if (parsesModernSyntax) new Function('window', SUPPORT_SYNTAX)(windowStub);
    new Function('window', 'document', SUPPORT_PROBE)(windowStub, documentStub);
    return documentStub.documentElement.className;
  };

  it('passes on a browser that supports the syntax', () => {
    // Node parses class static blocks. The false-positive direction: marking
    // here would take the app away from someone whose browser is fine.
    expect(run(true)).toBe('');
  });

  it('marks a browser whose parser threw the first script away', () => {
    expect(run(false).trim()).toBe('browser-too-old');
  });
});

describe('what the notice says', () => {
  it('names the version rather than saying "update your browser"', () => {
    expect(UNSUPPORTED_COPY.body).toContain(MINIMUM.safari);
    expect(UNSUPPORTED_COPY.body).toContain(MINIMUM.chrome);
  });

  it('tells someone on a device that CANNOT update', () => {
    // The iPad Air 2 that prompted this stopped at iPadOS 15.8. Sending its
    // owner to a Settings screen that will never offer 16.4 is worse than
    // saying plainly that the device is too old.
    expect(UNSUPPORTED_COPY.hint).toMatch(/older iPad|stopped receiving updates/i);
  });
});
