'use strict';

const noop = () => {};
noop.sync = noop;
module.exports = noop;
