'use strict';

const fs = require('fs');
const path = require('path');
const { defaultConfig } = require('./clipboard');

function createConfigStore(baseDir, options = {}) {
  const noop = () => {};
  const logger = options.logger || { error: noop, warn: noop, info: noop };
  const configPath = path.join(baseDir, 'config.json');
  const backupPath = `${configPath}.bak`;

  function backupExistingConfig() {
    try {
      if (fs.existsSync(configPath)) {
        fs.copyFileSync(configPath, backupPath);
      }
    } catch (err) {
      logger.error('Failed to backup config:', err);
    }
  }

  function restoreFromBackup() {
    try {
      if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, configPath);
        return true;
      }
    } catch (err) {
      logger.error('Failed to restore config from backup:', err);
    }
    return false;
  }

  function load() {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...defaultConfig, ...parsed };
      }
    } catch (err) {
      logger.error('Failed to load config, attempting restore from backup:', err);
      if (restoreFromBackup()) {
        return load();
      }
    }
    return { ...defaultConfig };
  }

  function save(config) {
    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      backupExistingConfig();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to save config:', err);
      restoreFromBackup();
    }
  }

  return {
    load,
    save,
    configPath,
    backupPath,
  };
}

module.exports = {
  createConfigStore,
  defaultConfig,
};
