'use strict';

function assert(condition, msg) {
    if (!condition) console.warn('Assertion failed:', msg);
}
assert.ok = assert;
module.exports = assert;
