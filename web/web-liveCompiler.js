'use strict';

// Stub implementation for Step 1 — no compilation.
// Will be replaced with a full inkjs-based implementation in Step 2.

var events = {};
var project = null;

exports.WebLiveCompiler = {
    setProject: (p) => { project = p; },
    setEdited:  () => {},
    setEvents:  (e) => { events = e; },
    getIssues:  () => [],
    getIssuesForFilename: () => [],
    choose:   () => {},
    rewind:   () => {},
    stepBack: () => {},
    getLocationInSource:  (_offset, cb) => cb(null),
    getRuntimePathInSource: (_path, cb) => cb(null),
    evaluateExpression:  (_expr, cb) => cb(null, 'not available in web mode'),
    getStats:  (cb) => cb({}),
    exportJson: (_compat, cb) => cb('Export not available in web mode'),
};
