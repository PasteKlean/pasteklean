'use strict';

const crypto = require('crypto');

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

function cleanText(text, options = {}) {
  const config = { ...defaultConfig, ...options };

  if (typeof text !== 'string') {return text;}

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

module.exports = {
  defaultConfig,
  hashText,
  smartQuotesToAscii,
  cleanText,
};
