import { MINIMUM, SUPPORT_PROBE, UNSUPPORTED_COPY } from '../lib/browser-support';

/**
 * Jira GRW-197 — the notice an unsupported browser gets instead of a dead app.
 *
 * Two pieces that must stay together:
 *
 * 1. An inline ES5 probe, first thing in `<body>`, which marks `<html>` when
 *    the browser cannot parse what Next ships. It is a SEPARATE script element
 *    from the app bundle on purpose — a SyntaxError in one script does not stop
 *    another, which is the only reason this can run at all on a browser where
 *    the app cannot.
 *
 * 2. The notice itself, server-rendered and hidden by default. CSS reveals it
 *    and hides the app when the mark is present, so there is no flash and no
 *    JavaScript needed to show it — which matters, because the browser being
 *    told this is one whose JavaScript is failing.
 *
 * Rendered by the server on every page, costing one hidden `<div>` and a
 * four-line script to a browser that is fine. FR-04.
 */
export function BrowserGate() {
  return (
    <>
      {/*
        `dangerouslySetInnerHTML` is the only way to emit an inline script whose
        contents do not pass through the bundler — and not passing through the
        bundler is the entire point. Compiled, this would be transpiled to the
        target it exists to detect, and would parse on exactly the browsers it
        is meant to catch.

        Nothing here is user input: `SUPPORT_PROBE` is a constant in this repo.
      */}
      <script dangerouslySetInnerHTML={{ __html: SUPPORT_PROBE }} />

      <div className="browser-gate" role="alert" aria-live="polite">
        <div className="browser-gate-card">
          <h1>{UNSUPPORTED_COPY.title}</h1>
          <p>{UNSUPPORTED_COPY.body}</p>
          <p className="browser-gate-hint">{UNSUPPORTED_COPY.hint}</p>
          <p className="browser-gate-min">
            Safari {MINIMUM.safari}+ · Chrome {MINIMUM.chrome}+ · Edge {MINIMUM.edge}+ · Firefox {MINIMUM.firefox}+
          </p>
        </div>
      </div>
    </>
  );
}
