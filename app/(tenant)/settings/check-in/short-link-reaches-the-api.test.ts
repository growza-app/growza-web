import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/en.json';
import hi from '../../../../messages/hi.json';
import { pinFromText } from '../../lib/geo-fix';

/**
 * The hint on the maps box describes the one paste that could not work.
 *
 * "Share the branch from Google Maps and paste the link here" gets you `maps.app.goo.gl/AbC123` — an id, no
 * numbers. The API learned to follow that redirect in `306e44a8` and took it on `geoLink`; this form has
 * always parsed the text itself and sent a pin, so `geoLink` had no caller from the owner's app and the
 * short link died here, two lines before the code that could have resolved it. The flag that does nothing,
 * except the flag was a whole feature.
 *
 * A long maps URL is still read on this side and sent as a pin: that paste costs no request at all.
 */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const here = __dirname;
const form = strip(readFileSync(resolve(here, 'CheckInForm.tsx'), 'utf8'));
const bar = strip(readFileSync(resolve(here, '../SettingsSaveBar.tsx'), 'utf8'));

describe('a shared maps link reaches the API that can read it', () => {
  it('knows which pastes this side can read, and which have to be sent', () => {
    // What the parser handles: the long URL, and numbers typed or copied by hand.
    expect(pinFromText('https://www.google.com/maps/@12.9352,77.6245,17z')).toEqual({ lat: 12.9352, lng: 77.6245 });
    expect(pinFromText('12.97123, 77.59456')).toEqual({ lat: 12.97123, lng: 77.59456 });
    // What it cannot, and therefore what has to travel: Google's and Apple's share links.
    expect(pinFromText('https://maps.app.goo.gl/AbC123xyz')).toBeNull();
    expect(pinFromText('https://maps.apple.com/p/XYZ')).toBeNull();
    expect(form).toMatch(/const sendsLink = link\.trim\(\) !== '' && !pinFromText\(link\);/);
  });

  it('sends one or the other, never both', () => {
    // `geoLink` wins over `geoPin` at the API, so sending a stale pin beside a link would be ignored anyway —
    // and sending a link beside a good pin would throw the good pin away on a 400.
    expect(form).toMatch(/sendsLink\s*\n?\s*\? \{ geoLink: link\.trim\(\), geoRadiusM: radius, geoEnabled: enabled, geoDeskApproves: deskApproves \}\s*\n?\s*: \{ geoPin: pin, geoRadiusM: radius, geoEnabled: enabled, geoDeskApproves: deskApproves \}/);
  });

  it('does not refuse the switch for want of a pin it is about to fetch', () => {
    // `enabled && !pin` turned "paste a link AND turn it on" into "Set the branch location before turning
    // this on" — for a link that resolves perfectly well a second later.
    expect(form).toMatch(/if \(enabled && !pin && !sendsLink\) \{/);
  });

  it('answers a link it could not read in this form’s own words', () => {
    // The API's sentence is written once, in English. `field` is how a form knows which refusal it was (GRW-473).
    expect(form).toMatch(/if \(err instanceof ApiError && err\.field === 'geoLink'\) setError\(t\('errors\.noPlaceInLink'\)\);/);
    expect(en.settingsCheckIn.errors.noPlaceInLink).toBeTruthy();
    expect(hi.settingsCheckIn.errors.noPlaceInLink).toBeTruthy();
  });

  it('says that the lookup is waiting on Save, since the status still reads "not set"', () => {
    expect(form).toMatch(/\{sendsLink \? t\('linkOnSave'\) : t\('linkHint'\)\}/);
    expect(en.settingsCheckIn.linkOnSave).toBeTruthy();
    expect(hi.settingsCheckIn.linkOnSave).toBeTruthy();
    // And the hint it replaces is now a true sentence, so it stays as it is.
    expect(en.settingsCheckIn.linkHint).toMatch(/Share the branch from Google Maps/);
  });
});

describe('the save bar has no "Saved" note, and no longer asks for one', () => {
  /*
   * GRW-556 (follow-up) made every form using this bar close on a successful save, so the note could only
   * ever render one tick after `router.push`, on a screen nobody is looking at. The Settings list says it
   * instead (`SavedToast`). Seven call sites were keeping a boolean and a string to feed it.
   */
  it('takes neither prop, and draws no note', () => {
    expect(bar).not.toMatch(/saved|savedLabel|settings-savebar-note/);
  });

  it('and no form still keeps the flag', () => {
    const forms = ['check-in/CheckInForm', 'gst/GstForm', 'booking/BookingRulesForm', 'working-hours/WorkingHoursForm', 'notifications/RemindersForm', 'report-access/ReportAccessForm'];
    for (const f of forms) {
      const src = strip(readFileSync(resolve(here, `../${f}.tsx`), 'utf8'));
      expect(src, f).not.toMatch(/saved=\{|savedLabel=\{|setSaved\(|setGraceSaved\(/);
      // Each still closes, which is what the flag was standing in for.
      expect(src, f).toMatch(/closeForm\(\);/);
    }
  });

  it('leaves alone the one "Saved" that is really drawn', () => {
    // `ClientContactForm` has its own badge, not this bar's note, and keeps its key.
    const own = readFileSync(resolve(here, '../report-access/ClientContactForm.tsx'), 'utf8');
    expect(own).toMatch(/\{t\('saved'\)\}/);
    expect(en.settingsReports.saved).toBe('Saved');
  });
});
