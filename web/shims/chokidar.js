'use strict';

// File watching is not available in the browser.
const watcher = { on: () => watcher, close: () => {} };
module.exports = { watch: () => watcher };
