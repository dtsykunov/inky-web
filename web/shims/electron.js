
// IPC shim: supports real on/once/removeListener/emit so that renderer
// modules that use ipcRenderer.on(channel, ...) can be triggered from
// web code via ipcRenderer.emit(channel, ...).
const _listeners = {};

const ipcRenderer = {
    on: (ch, cb) => {
        (_listeners[ch] = _listeners[ch] || []).push(cb);
        return ipcRenderer;
    },
    once: (ch, cb) => {
        const wrap = (...a) => { ipcRenderer.removeListener(ch, wrap); cb(...a); };
        return ipcRenderer.on(ch, wrap);
    },
    send: () => {},
    // i18n.js calls sendSync('i18n._', msgid) — return the msgid as-is
    sendSync: (_ch, ...args) => args[0],
    invoke: () => Promise.resolve({}),
    removeListener: (ch, cb) => {
        if (_listeners[ch]) _listeners[ch] = _listeners[ch].filter(f => f !== cb);
        return ipcRenderer;
    },
    removeAllListeners: (ch) => {
        if (ch) delete _listeners[ch];
        else Object.keys(_listeners).forEach(k => delete _listeners[k]);
        return ipcRenderer;
    },
    emit: (ch, ...args) => {
        (_listeners[ch] || []).forEach(cb => cb({}, ...args));
    },
};

module.exports = { ipcRenderer };
