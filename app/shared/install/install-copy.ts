import type { InstallApp, InstallMode } from './install-logic';

/**
 * Jira GRW-265 · GRW-270 — every word of the install banner.
 *
 * Laid out like the browser's own "Install app" dialog the owner pointed at —
 * a title, the app, Cancel and Install — so it reads as the familiar thing.
 * Plain words for people who are not confident with phone menus; the only
 * menu labels quoted are the ones the phone itself shows.
 */

export interface InstallBannerCopy {
  title: string;
  appName: string;
  /** Short steps, when Install cannot open the browser's own dialog here. */
  steps: string[];
  cancel: string;
  /** Only when tapping it can actually install. */
  install: string | null;
}

const appName: Record<InstallApp, string> = {
  salon: 'Growza',
  admin: 'Growza Admin',
};

/**
 * Jira GRW-364 — Hindi for the salon app. The menu names in quotes stay as the phone
 * usually shows them (most phones keep those menus in English); the admin app is English.
 */
const HINDI: Record<InstallMode, { steps: (name: string) => string[]; install: string | null }> = {
  prompt: { steps: (name) => ['नीचे “इंस्टॉल करें” दबाएँ', `${name} को अपनी होम स्क्रीन से खोलें, किसी भी ऐप की तरह`], install: 'इंस्टॉल करें' },
  ios: { steps: () => ['“Share” बटन दबाएँ', '“Add to Home Screen” दबाएँ', '“Add” दबाएँ'], install: null },
  'android-menu': { steps: () => ['ऊपर दाएँ ⋮ मेन्यू दबाएँ', '“Install app” या “Add to Home screen” दबाएँ'], install: null },
  'in-app-android': { steps: () => ['ऊपर दाएँ ⋮ दबाएँ', '“Open in Chrome” दबाएँ', 'वहाँ से इंस्टॉल करें'], install: null },
  'in-app-ios': { steps: () => ['… या Safari बटन दबाएँ', '“Open in Safari” दबाएँ', 'वहाँ से होम स्क्रीन में जोड़ें'], install: null },
};

export function installBannerCopy(app: InstallApp, mode: InstallMode, lang: 'en' | 'hi' = 'en'): InstallBannerCopy {
  const name = appName[app];
  if (lang === 'hi' && app === 'salon') {
    const h = HINDI[mode];
    return { title: 'ऐप इंस्टॉल करें', appName: name, cancel: 'रद्द करें', steps: h.steps(name), install: h.install };
  }
  const base = { title: 'Install app', appName: name, cancel: 'Cancel' };

  switch (mode) {
    case 'prompt':
      return {
        ...base,
        steps: ['Tap Install below', `Open ${name} from your home screen, like any app`],
        install: 'Install',
      };
    case 'ios':
      return {
        ...base,
        steps: ['Tap the Share button', 'Tap “Add to Home Screen”', 'Tap “Add”'],
        install: null,
      };
    case 'android-menu':
      return {
        ...base,
        steps: ['Tap the ⋮ menu at the top right', 'Tap “Install app” or “Add to Home screen”'],
        install: null,
      };
    case 'in-app-android':
      return {
        ...base,
        steps: ['Tap ⋮ at the top right', 'Tap “Open in Chrome”', 'Install it from there'],
        install: null,
      };
    case 'in-app-ios':
      return {
        ...base,
        steps: ['Tap … or the Safari button', 'Tap “Open in Safari”', 'Add it to your home screen from there'],
        install: null,
      };
  }
}
