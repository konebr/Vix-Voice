const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vixDesktop', Object.freeze({
  platform: process.platform,
  onAction(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, action) => callback(String(action));
    ipcRenderer.on('vix-desktop-action', listener);
    return () => ipcRenderer.removeListener('vix-desktop-action', listener);
  }
}));
