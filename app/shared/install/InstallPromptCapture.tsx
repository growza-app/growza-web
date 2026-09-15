/**
 * Jira GRW-265 · GRW-270 — catch the browser's install offer the moment it
 * happens.
 *
 * Chrome fires `beforeinstallprompt` once, early, often before React has
 * hydrated and before any component could be listening. Missed, it is gone
 * for that page view. So this is an inline script, first thing in `<body>`,
 * that stores the event on `window` and announces it; the banner reads it
 * whenever it is ready. `preventDefault` hands the moment to our banner
 * instead of Chrome's own mini-infobar, which Chrome may or may not show.
 *
 * ES5 on purpose, like BrowserGate's probe: this runs on browsers the app
 * bundle may not parse on. Nothing here is user input.
 */
const CAPTURE_SCRIPT = `(function(){try{
var s=window.__growzaInstall=window.__growzaInstall||{prompt:null,installed:false};
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();s.prompt=e;window.dispatchEvent(new Event('growza:installprompt'));});
window.addEventListener('appinstalled',function(){s.installed=true;s.prompt=null;window.dispatchEvent(new Event('growza:appinstalled'));});
}catch(e){}})();`;

export function InstallPromptCapture() {
  return <script dangerouslySetInnerHTML={{ __html: CAPTURE_SCRIPT }} />;
}
