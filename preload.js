'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const validChannels = {
  invoke: ['get-config', 'set-config', 'clean-clipboard', 'get-version', 'get-platform'],
  send: ['close-preferences', 'open-external', 'subscribe-config'],
  receive: ['config-updated', 'show-toast'],
};

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
});
