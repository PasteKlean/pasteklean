'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createConfigStore, defaultConfig } = require('../lib/config');

describe('config store', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pasteclean-test-'));
    store = createConfigStore(tmpDir, { logger: console });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      // ignore cleanup errors
    }
  });

  test('returns defaults when no config exists', () => {
    const config = store.load();
    expect(config).toMatchObject(defaultConfig);
  });

  test('saves and loads config', () => {
    const config = { ...defaultConfig, autoClean: false };
    store.save(config);
    const loaded = store.load();
    expect(loaded.autoClean).toBe(false);
  });

  test('backs up config before overwriting', () => {
    const first = { ...defaultConfig, autoClean: false };
    store.save(first);
    const second = { ...defaultConfig, autoClean: true };
    store.save(second);
    expect(fs.existsSync(store.backupPath)).toBe(true);
  });

  test('restores from backup if config is corrupt', () => {
    const goodConfig = { ...defaultConfig, autoClean: false };
    store.save(goodConfig);
    // Create a backup by saving again with different config.
    store.save({ ...defaultConfig, autoClean: true });
    fs.writeFileSync(store.configPath, 'not-json');
    const loaded = store.load();
    expect(loaded.autoClean).toBe(false);
  });
});
