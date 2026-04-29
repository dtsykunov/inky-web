'use strict';

// i18n.js calls ipcRenderer.sendSync('i18n._', msgid) — return the msgid as-is
const ipcRenderer = {
    on: () => ipcRenderer,
    once: () => ipcRenderer,
    send: () => {},
    sendSync: (_channel, ...args) => args[0],
    invoke: () => Promise.resolve({}),
    removeListener: () => ipcRenderer,
    removeAllListeners: () => ipcRenderer,
};

module.exports = { ipcRenderer };
