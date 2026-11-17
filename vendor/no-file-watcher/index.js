'use strict';
// Stand-in for @parcel/watcher (see package.json). Anything that tries to watch files says so loudly instead of silently doing nothing.
const refuse = () => {
  throw new Error('@parcel/watcher is replaced by a stand-in in this repo (GHSA-fc5q-39xc-vjpf). next-intl message extraction is not used here.');
};
module.exports = { subscribe: refuse, unsubscribe: refuse, getEventsSince: refuse, writeSnapshot: refuse };
