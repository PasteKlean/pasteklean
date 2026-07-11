'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, globalShortcut, shell, ipcMain, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isDev = process.argv.includes('--dev');
const platform = process.platform;

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

const defaultConfig = {
  autoClean: true,
  trimWhitespace: true,
  normalizeLineEndings: true,
  collapseSpaces: true,
  removeEmptyLines: false,
  removeHtml: false,
  removeNonAscii: false,
  smartQuotes: true,
  showNotifications: true,
  autoStart: false,
  shortcut: 'CommandOrControl+Shift+C',
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...defaultConfig, ...parsed };
    }
  } catch (err) {
    if (isDev) console.error('Failed to load config:', err);
  }
  return { ...defaultConfig };
}

function saveConfig(config) {
  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    if (isDev) console.error('Failed to save config:', err);
  }
}

let config = loadConfig();

const subscribedWindows = [];

function notifyConfigChanged() {
  for (let i = subscribedWindows.length - 1; i >= 0; i--) {
    const win = subscribedWindows[i];
    if (win.isDestroyed()) {
      subscribedWindows.splice(i, 1);
      continue;
    }
    win.webContents.send('config-updated', config);
  }
}

function setConfigValue(key, value) {
  config[key] = value;
  saveConfig(config);
  notifyConfigChanged();
  applyConfig();
}

function setConfig(next) {
  config = { ...config, ...next };
  saveConfig(config);
  notifyConfigChanged();
  applyConfig();
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function smartQuotesToAscii(text) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...');
}

function cleanText(text) {
  if (typeof text !== 'string') return text;

  let cleaned = text;

  if (config.removeHtml) {
    cleaned = cleaned.replace(/<[^>]*>/g, ' ');
  }

  if (config.smartQuotes) {
    cleaned = smartQuotesToAscii(cleaned);
  }

  if (config.normalizeLineEndings) {
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  if (config.removeEmptyLines) {
    cleaned = cleaned.replace(/\n\s*\n+/g, '\n');
  }

  if (config.collapseSpaces) {
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n +/g, '\n');
    cleaned = cleaned.replace(/ +\n/g, '\n');
  }

  if (config.removeNonAscii) {
    cleaned = cleaned.replace(/[^\x20-\x7E\n\t]/g, '');
  }

  if (config.trimWhitespace) {
    cleaned = cleaned.trim();
  }

  return cleaned;
}

let tray = null;
let preferencesWindow = null;
let pollTimer = null;
let shortcutRegistered = '';
let lastText = '';
let lastHash = '';
let writePending = false;

function showNotification(body) {
  if (!config.showNotifications) return;
  if (preferencesWindow && !preferencesWindow.isDestroyed()) {
    preferencesWindow.webContents.send('show-toast', body);
  }
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'PasteClean',
      body,
      silent: true,
      icon: getTrayIcon(),
    });
    notification.show();
  }
}

function performClean() {
  const text = clipboard.readText();
  const cleaned = cleanText(text);
  if (cleaned !== text) {
    clipboard.writeText(cleaned);
    writePending = true;
    lastText = cleaned;
    lastHash = hashText(cleaned);
    showNotification('Clipboard cleaned');
  } else {
    lastText = text;
    lastHash = hashText(text);
    showNotification('Clipboard already clean');
  }
}

function pollClipboard() {
  if (writePending) {
    const text = clipboard.readText();
    lastText = text;
    lastHash = hashText(text);
    writePending = false;
    return;
  }

  if (!config.autoClean) return;

  const text = clipboard.readText();
  if (text === lastText) return;

  const hash = hashText(text);
  if (hash === lastHash) return;

  const cleaned = cleanText(text);
  if (cleaned === text) {
    lastText = text;
    lastHash = hash;
    return;
  }

  clipboard.writeText(cleaned);
  writePending = true;
  lastText = cleaned;
  lastHash = hashText(cleaned);
  showNotification('Clipboard cleaned');
}

function resolveFirst(...paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[paths.length - 1];
}

function getTrayIcon() {
  const assets = path.join(__dirname, 'assets');
  if (platform === 'darwin') {
    const retina = path.join(assets, 'tray-mac@2x.png');
    const normal = path.join(assets, 'tray-mac.png');
    const chosen = resolveFirst(retina, normal, path.join(assets, 'tray-win.png'));
    return nativeImage.createFromPath(chosen);
  }
  if (platform === 'win32') {
    const retina = path.join(assets, 'tray-win@2x.png');
    const normal = path.join(assets, 'tray-win.png');
    const chosen = resolveFirst(retina, normal, path.join(assets, 'tray-mac.png'));
    return nativeImage.createFromPath(chosen);
  }
  return nativeImage.createFromPath(resolveFirst(
    path.join(assets, 'tray-win.png'),
    path.join(assets, 'tray-mac.png')
  ));
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Clean Clipboard',
      click: () => performClean(),
      accelerator: config.shortcut,
    },
    {
      label: 'Auto Clean',
      type: 'checkbox',
      checked: config.autoClean,
      click: (item) => setConfigValue('autoClean', item.checked),
    },
    { type: 'separator' },
    {
      label: 'Preferences...',
      click: () => openPreferences(),
    },
    {
      label: 'Check for Updates',
      click: async () => {
        try {
          await autoUpdater.checkForUpdates();
        } catch (err) {
          if (isDev) console.error('Update check failed:', err);
          showNotification('Update check failed');
        }
      },
    },
    {
      label: 'Open at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
        setConfigValue('autoStart', item.checked);
      },
      visible: platform === 'darwin' || platform === 'win32',
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (pollTimer) clearInterval(pollTimer);
        globalShortcut.unregisterAll();
        app.quit();
      },
    },
  ]);
}

function buildTrayMenuDarwin() {
  const menu = buildTrayMenu();
  const template = menu.items.filter((item) => item.label !== 'Quit');
  return Menu.buildFromTemplate(template);
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(platform === 'darwin' ? buildTrayMenuDarwin() : buildTrayMenu());
}

function createTray() {
  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('PasteClean');
  tray.setContextMenu(platform === 'darwin' ? buildTrayMenuDarwin() : buildTrayMenu());
  tray.on('double-click', () => performClean());
  tray.on('click', () => {
    if (platform === 'win32') {
      tray.popUpContextMenu();
    } else if (platform === 'linux') {
      openPreferences();
    } else if (platform === 'darwin') {
      tray.popUpContextMenu();
    }
  });
  tray.on('right-click', () => {
    if (platform === 'darwin') tray.popUpContextMenu();
  });
}

function openPreferences() {
  if (preferencesWindow && !preferencesWindow.isDestroyed()) {
    preferencesWindow.focus();
    return;
  }

  preferencesWindow = new BrowserWindow({
    width: 520,
    height: 700,
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    title: 'PasteClean Preferences',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  preferencesWindow.loadFile(path.join(__dirname, 'renderer', 'preferences.html'));

  preferencesWindow.once('ready-to-show', () => {
    preferencesWindow.show();
  });

  preferencesWindow.on('closed', () => {
    preferencesWindow = null;
  });
}

function applyShortcuts() {
  globalShortcut.unregisterAll();
  if (config.shortcut && config.shortcut !== 'None') {
    try {
      const registered = globalShortcut.register(config.shortcut, performClean);
      if (!registered) {
        if (isDev) console.warn('Failed to register shortcut:', config.shortcut);
      } else {
        shortcutRegistered = config.shortcut;
      }
    } catch (err) {
      if (isDev) console.error('Shortcut registration error:', err);
    }
  }
}

function applyConfig() {
  applyShortcuts();
  updateTrayMenu();
  if (platform === 'darwin' || platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: config.autoStart });
  }
}

function setupAutoUpdater() {
  autoUpdater.on('error', (err) => {
    if (isDev) console.error('Auto-updater error:', err);
  });

  autoUpdater.on('checking-for-update', () => {
    if (isDev) console.log('Checking for update...');
  });

  autoUpdater.on('update-available', () => {
    showNotification('A new version is available and will be downloaded.');
  });

  autoUpdater.on('update-not-available', () => {
    if (isDev) console.log('No update available.');
  });

  autoUpdater.on('update-downloaded', () => {
    showNotification('Update downloaded. It will be installed on quit.');
  });
}

function setupIpc() {
  ipcMain.handle('get-config', () => config);

  ipcMain.handle('set-config', (_event, next) => {
    setConfig(next);
    return config;
  });

  ipcMain.handle('clean-clipboard', () => {
    performClean();
    return config;
  });

  ipcMain.handle('get-version', () => app.getVersion());
  ipcMain.handle('get-platform', () => platform);

  ipcMain.on('close-preferences', () => {
    if (preferencesWindow && !preferencesWindow.isDestroyed()) {
      preferencesWindow.close();
    }
  });

  ipcMain.on('open-external', (_event, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
  });

  ipcMain.on('subscribe-config', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !subscribedWindows.includes(win)) {
      subscribedWindows.push(win);
    }
  });
}

if (platform === 'win32') {
  app.setAppUserModelId('io.surgegrid.pasteclean');
}

app.on('ready', () => {
  if (platform === 'darwin') {
    app.dock.hide();
  }

  createTray();
  setupIpc();
  setupAutoUpdater();
  applyConfig();

  lastText = clipboard.readText();
  lastHash = hashText(lastText);

  pollTimer = setInterval(pollClipboard, 250);

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  if (isDev && process.argv.includes('--open-prefs')) {
    openPreferences();
  }
});

app.on('window-all-closed', () => {
  // Keep menubar/tray alive.
});

app.on('activate', () => {
  openPreferences();
});

app.on('second-instance', () => {
  openPreferences();
});

app.on('will-quit', () => {
  if (pollTimer) clearInterval(pollTimer);
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  if (pollTimer) clearInterval(pollTimer);
  globalShortcut.unregisterAll();
});
