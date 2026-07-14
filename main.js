'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, globalShortcut, shell, ipcMain, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const log = require('electron-log/main');

const { cleanText, hashText } = require('./lib/clipboard');
const { createConfigStore } = require('./lib/config');
const sentry = require('./lib/sentry');
const crash = require('./lib/crash');

log.initialize();

const isDev = process.argv.includes('--dev');
const platform = process.platform;

const packageJson = (() => {
  try {
    return require('./package.json');
  } catch (err) {
    log.error('Failed to load package.json:', err);
    return { version: '1.0.0', sentryDsn: '' };
  }
})();

const sentryDsn = process.env.SENTRY_DSN || /** @type {any} */ (packageJson).sentryDsn;
sentry.init({
  dsn: sentryDsn,
  release: `pasteclean@${packageJson.version || '1.0.0'}`,
  environment: app.isPackaged ? 'production' : 'development',
  logger: log,
});

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  log.warn('Another instance is already running; quitting.');
  app.quit();
  process.exit(0);
}

const userDataPath = app.getPath('userData');
const configStore = createConfigStore(userDataPath, { logger: log });

let config = configStore.load();

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
  configStore.save(config);
  notifyConfigChanged();
  applyConfig();
}

function setConfig(next) {
  config = { ...config, ...next };
  configStore.save(config);
  notifyConfigChanged();
  applyConfig();
}

let tray = null;
let preferencesWindow = null;
let pollTimer = null;

let lastText = '';
let lastHash = '';
let writePending = false;

function showNotification(body) {
  if (!config.showNotifications) {return;}
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
  const cleaned = cleanText(text, config);
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

  if (!config.autoClean) {return;}

  try {
    const text = clipboard.readText();
    if (text === lastText) {return;}

    const hash = hashText(text);
    if (hash === lastHash) {return;}

    const cleaned = cleanText(text, config);
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
  } catch (err) {
    log.error('Clipboard poll error:', err);
    sentry.captureException(err);
  }
}

function resolveFirst(...paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) {return p;}
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
          log.error('Update check failed:', err);
          sentry.captureException(err);
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
        if (pollTimer) {clearInterval(pollTimer);}
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
  if (!tray) {return;}
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
    if (platform === 'darwin') {tray.popUpContextMenu();}
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
        log.warn('Failed to register shortcut:', config.shortcut);
      }
    } catch (err) {
      log.error('Shortcut registration error:', err);
      sentry.captureException(err);
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
    log.error('Auto-updater error:', err);
    sentry.captureException(err);
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', () => {
    showNotification('A new version is available and will be downloaded.');
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No update available.');
  });

  autoUpdater.on('update-downloaded', () => {
    showNotification('Update downloaded. It will be installed on quit.');
  });

  autoUpdater.setFeedURL({ provider: 'github', owner: 'PasteKlean', repo: 'pasteklean' });
}

function setupIpc() {
  ipcMain.handle('get-config', () => config);

  ipcMain.handle('set-config', (_event, next) => {
    try {
      setConfig(next);
    } catch (err) {
      log.error('Failed to set config:', err);
      sentry.captureException(err);
    }
    return config;
  });

  ipcMain.handle('clean-clipboard', () => {
    try {
      performClean();
    } catch (err) {
      log.error('Failed to clean clipboard:', err);
      sentry.captureException(err);
    }
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

  ipcMain.on('report-error', (_event, payload) => {
    try {
      const err = payload && payload.stack ? new Error(payload.message) : new Error(String(payload));
      if (payload && payload.stack) {err.stack = payload.stack;}
      log.error('Renderer reported error:', err);
      sentry.captureException(err);
    } catch (e) {
      log.error('Failed to report renderer error:', e);
    }
  });
}

if (platform === 'win32') {
  app.setAppUserModelId('io.surgegrid.pasteclean');
}

crash.setupCrashReporter({ logger: log, sentry });

app.on('ready', () => {
  if (platform === 'darwin') {
    app.dock.hide();
  }

  createTray();
  setupIpc();
  setupAutoUpdater();
  applyConfig();

  try {
    lastText = clipboard.readText();
    lastHash = hashText(lastText);
  } catch (err) {
    log.error('Failed to read initial clipboard:', err);
    sentry.captureException(err);
  }

  pollTimer = setInterval(pollClipboard, 250);

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.error('Auto-updater initial check failed:', err);
      sentry.captureException(err);
    });
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
  if (pollTimer) {clearInterval(pollTimer);}
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  if (pollTimer) {clearInterval(pollTimer);}
  globalShortcut.unregisterAll();
});
