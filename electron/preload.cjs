'use strict';
// Exposes the minimal native bridge the game uses (storage and quit); nothing else reaches the page.
const { contextBridge, ipcRenderer } = require('electron');

function call(channel, ...args) {
  const res = ipcRenderer.sendSync(channel, ...args);
  if (!res || !res.ok) throw new Error(res ? res.error : `${channel} failed`);
  return res.value;
}

contextBridge.exposeInMainWorld('vesperNative', {
  readSync: (key) => call('storage:read', key),
  writeSync: (key, value) => call('storage:write', key, value),
  removeSync: (key) => call('storage:remove', key),
  keysSync: () => call('storage:keys'),
  quit: () => ipcRenderer.send('app:quit'),
  setFullscreen: (on) => ipcRenderer.send('app:fullscreen', on),
  platform: process.platform,
});
