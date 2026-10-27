'use strict';
// Electron main process for the Windows desktop build (Charter: Windows 10/11, 64-bit).
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const { createFileStorage } = require('./storage.cjs');

let storage = null;
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0b0a14',
    title: 'VESPER: The Shattered Firmament',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // The game never navigates or opens windows; external links go to the default browser.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) win.setFullScreen(!win.isFullScreen());
  });
}

function handleSync(channel, fn) {
  ipcMain.on(channel, (event, ...args) => {
    try {
      event.returnValue = { ok: true, value: fn(...args) };
    } catch (e) {
      event.returnValue = { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  storage = createFileStorage(path.join(app.getPath('userData'), 'saves'));
  handleSync('storage:read', (key) => storage.read(key));
  handleSync('storage:write', (key, value) => storage.write(key, value));
  handleSync('storage:remove', (key) => storage.remove(key));
  handleSync('storage:keys', () => storage.keys());
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.on('app:fullscreen', (_e, on) => win && win.setFullScreen(!!on));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
