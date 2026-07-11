'use strict';

(function () {
  const keys = [
    'autoClean',
    'trimWhitespace',
    'normalizeLineEndings',
    'collapseSpaces',
    'removeEmptyLines',
    'removeHtml',
    'removeNonAscii',
    'smartQuotes',
    'showNotifications',
    'autoStart',
  ];

  const shortcutInput = document.getElementById('shortcut');
  const cleanNowButton = document.getElementById('cleanNow');
  const closeButton = document.getElementById('close');
  const versionLabel = document.getElementById('version');
  const toast = document.getElementById('toast');

  let toastTimer = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
    }, 2000);
  }

  function renderConfig(config) {
    keys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.checked = Boolean(config[key]);
    });

    if (config.shortcut) {
      shortcutInput.value = config.shortcut;
    }
  }

  function bindEvents() {
    keys.forEach((key) => {
      const el = document.getElementById(key);
      if (!el) return;
      el.addEventListener('change', async () => {
        const update = { [key]: el.checked };
        const config = await window.api.setConfig(update);
        renderConfig(config);
      });
    });

    cleanNowButton.addEventListener('click', async () => {
      const config = await window.api.cleanClipboard();
      renderConfig(config);
    });

    closeButton.addEventListener('click', () => {
      window.api.closePreferences();
    });

    shortcutInput.addEventListener('focus', () => {
      shortcutInput.value = 'Press a key combination...';
    });

    shortcutInput.addEventListener('keydown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const modifiers = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.metaKey) modifiers.push('Cmd');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');

      const key = e.key;
      if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') {
        return;
      }

      const electronShortcut = [
        e.ctrlKey ? 'CommandOrControl' : '',
        e.shiftKey ? 'Shift' : '',
        e.altKey ? 'Alt' : '',
        key.length === 1 ? key.toUpperCase() : key,
      ]
        .filter(Boolean)
        .join('+');

      window.api.setConfig({ shortcut: electronShortcut }).then((config) => {
        renderConfig(config);
      });
    });

    shortcutInput.addEventListener('blur', () => {
      window.api.getConfig().then((config) => {
        if (config.shortcut) shortcutInput.value = config.shortcut;
      });
    });
  }

  async function init() {
    const config = await window.api.getConfig();
    renderConfig(config);

    const version = await window.api.getVersion();
    versionLabel.textContent = 'v' + version;

    bindEvents();

    window.api.subscribeConfig((nextConfig) => {
      renderConfig(nextConfig);
    });

    window.api.onShowToast((message) => {
      showToast(message);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
