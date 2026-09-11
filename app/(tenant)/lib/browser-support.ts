/**
 * Jira GRW-197 — tell an unsupported browser that it is unsupported.
 *
 * ## What happens without this
 *
 * Reported from the field: *"i opened my ipad air 2 and i am not able to click
 * many buttons on it"*. The device drew the app correctly — header, navigation,
 * lists, the buttons themselves — and then did essentially nothing when tapped.
 *
 * It is not a layout bug. A hit-test probe (does `elementFromPoint` at a
 * control's own centre return that control?) ran every tenant route at both
 * iPad Air 2 orientations in Chromium *and* real WebKit, and came back clean in
 * both. No overlay, no obstruction.
 *
 * The cause is the build target. Next.js 16.3.1 compiles for
 * `MODERN_BROWSERSLIST_TARGET` — chrome 111, edge 111, firefox 111, **safari
 * 16.4**. The iPad Air 2 cannot go past iPadOS 15.8, which is Safari 15.6.
 * Confirmed in the built output rather than assumed:
 * `.next/static/chunks/…` contains
 *
 *     class _ extends i.default.Component{static{this.contextType=…}}
 *
 * A class `static { }` block is Safari 16.4. Below that it is a *parse-time*
 * SyntaxError, so the entire chunk never executes — and that chunk is the App
 * Router's client runtime, loaded on every page. The server-rendered HTML
 * paints, React never hydrates, every `onClick` is dead, and plain `<a href>`
 * links still work. Which is exactly "many buttons don't work" rather than all
 * or none.
 *
 * ## Why the fix is the message and not the support
 *
 * Next 16 does not consult a `browserslist` key for its own runtime — there is
 * no reference to browserslist anywhere in `next/dist/build` — and the offending
 * syntax is in Next's prebuilt chunks, not ours. Supporting Safari 15 means
 * pinning Next backwards, for a 2014 device Apple stopped updating.
 *
 * So the defect worth fixing is the SILENCE. The app currently fails in the
 * worst available way: it looks like it is working. The same shape as GRW-192's
 * off-screen navigation and GRW-216's empty-shell measurements — an absence
 * that reads as success.
 */

/**
 * The floor, kept honest by a test rather than by memory.
 *
 * `browser-support.test.ts` compares this against Next's own
 * `MODERN_BROWSERSLIST_TARGET` and fails if an upgrade moves it — BR-02. A
 * number copied into a comment would be right until the day it was not, and
 * nothing would say so.
 */
export const MINIMUM = {
  safari: '16.4',
  chrome: '111',
  edge: '111',
  firefox: '111',
} as const;

/**
 * The one syntax that decides it, as a string for an inline `<script>`.
 *
 * ## Feature-tested, not sniffed
 *
 * A user-agent string can be edited, spoofed, frozen or simply unfamiliar, and
 * a version comparison against it is a guess about what a browser can do. This
 * asks the browser directly, using the exact construct that breaks: a class
 * `static {}` initialisation block, which is what Next's own runtime contains.
 * If this parses, that chunk parses.
 *
 * ## Why `new Function` and not the literal syntax
 *
 * Written inline, `class X{static{}}` would be a parse error in *this* script
 * on the very browsers it is meant to detect — the detector would die of the
 * disease it diagnoses. Inside a string handed to `new Function`, the parse
 * happens at call time and throws a catchable `SyntaxError`.
 *
 * ## ES5 only, deliberately
 *
 * No arrow functions, no `const`, no template literals. Everything here must
 * parse on a browser that cannot parse the app — BR-03. A guard written in the
 * syntax it is guarding against is not a guard.
 */
export const SUPPORT_PROBE = `(function () {
  try {
    new Function('class X{static{}}');
  } catch (e) {
    document.documentElement.className += ' browser-too-old';
  }
})();`;

/** What the notice says. Names the version, because "update your browser" is not actionable on an iPad that cannot. */
export const UNSUPPORTED_COPY = {
  title: 'This browser is too old to run Growza',
  body: `Growza needs Safari ${MINIMUM.safari} or newer (iOS/iPadOS ${MINIMUM.safari}+), or Chrome, Edge or Firefox ${MINIMUM.chrome} or newer.`,
  /*
   * The sentence that matters on the device that prompted this.
   *
   * An iPad Air 2 cannot be updated — Apple stopped at iPadOS 15.8 — and
   * telling its owner to "update to iPadOS 16.4" sends them to a Settings
   * screen that will never offer it. Naming the possibility that the device is
   * simply too old is kinder than a instruction that cannot be followed.
   */
  hint: 'If this is an older iPad or phone that has stopped receiving updates, it will not be able to run Growza. Any device on iOS 16.4 or newer, or an Android tablet, will work.',
} as const;
