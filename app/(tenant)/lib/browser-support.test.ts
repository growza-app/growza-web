import { describe, expect, it } from 'vitest';
import { MINIMUM, SUPPORT_PROBE, UNSUPPORTED_COPY } from './browser-support';

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
    // exact syntax found in Next's own runtime chunk.
    expect(SUPPORT_PROBE).toContain('static{}');
    expect(SUPPORT_PROBE).toContain('new Function');
  });

  it('marks the document rather than throwing', () => {
    // A detector that throws takes out whatever runs after it.
    expect(SUPPORT_PROBE).toContain('try');
    expect(SUPPORT_PROBE).toContain('catch');
    expect(SUPPORT_PROBE).toContain('browser-too-old');
  });

  it('passes on a browser that supports the syntax', () => {
    // Node parses class static blocks, so running the probe here must NOT mark
    // the document — the false-positive direction, which would take the app
    // away from someone whose browser is fine.
    const marks: string[] = [];
    const documentStub = { documentElement: { className: '' } };
    const run = new Function('document', SUPPORT_PROBE);
    run(documentStub);
    marks.push(documentStub.documentElement.className);
    expect(marks[0]).toBe('');
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
