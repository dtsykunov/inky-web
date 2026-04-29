

// No-op stubs — file system is not available in the browser.
// Real I/O goes through web-inkFile.js / web-inkProject.js.
const noop = () => {};
const noopCb = (cb) => cb && cb(new Error('fs not available in browser'));

module.exports = {
    readFile:    (_p, _enc, cb) => noopCb(cb),
    writeFile:   (_p, _d, _enc, cb) => noopCb(cb),
    stat:        (_p, cb) => noopCb(cb),
    exists:      (_p, cb) => cb && cb(false),
    unlink:      (_p, cb) => noop(cb),
    existsSync:  () => false,
    unlinkSync:  noop,
    mkdirSync:   noop,
};
