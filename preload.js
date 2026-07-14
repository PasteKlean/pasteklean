'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),

  setConfig: (config) => ipcRenderer.invoke('set-config', config),

  cleanClipboard: () => ipcRenderer.invoke('clean-clipboard'),

  getVersion: () => ipcRenderer.invoke('get-version'),

  getPlatform: () => ipcRenderer.invoke('get-platform'),

  closePreferences: () => ipcRenderer.send('close-preferences'),

  openExternal: (url) => ipcRenderer.send('open-external', url),

  subscribeConfig: (callback) => {
    const handler = (_event, config) => callback(config);
    ipcRenderer.on('config-updated', handler);
    ipcRenderer.send('subscribe-config');
    return () => {
      ipcRenderer.removeListener('config-updated', handler);
    };
  },

  onShowToast: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('show-toast', handler);
    return () => {
      ipcRenderer.removeListener('show-toast', handler);
    };
  },

  reportError: (err) => {
    const payload = err && err.message ? { message: err.message, stack: err.stack || '' } : { message: String(err) };
    ipcRenderer.send('report-error', payload);
  },
});
