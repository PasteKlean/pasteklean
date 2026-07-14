'use strict';

const { cleanText, hashText, smartQuotesToAscii } = require('../lib/clipboard');

describe('clipboard cleaner', () => {
  test('trims whitespace by default', () => {
    expect(cleanText('  hello world  ')).toBe('hello world');
  });

  test('normalizes line endings', () => {
    expect(cleanText('line1\r\nline2\rline3')).toBe('line1\nline2\nline3');
  });

  test('collapses spaces', () => {
    expect(cleanText('hello    world')).toBe('hello world');
  });

  test('removes empty lines when enabled', () => {
    const input = 'line1\n\n\nline2';
    expect(cleanText(input, { removeEmptyLines: true })).toBe('line1\nline2');
  });

  test('strips HTML tags when enabled', () => {
    expect(cleanText('<p>hello</p>', { removeHtml: true })).toBe('hello');
  });

  test('removes non-ASCII when enabled', () => {
    expect(cleanText('café', { removeNonAscii: true })).toBe('caf');
  });

  test('replaces smart quotes with ASCII when enabled', () => {
    expect(cleanText('“hello” it’s great—yes…', { smartQuotes: true })).toBe('"hello" it\'s great-yes...');
  });

  test('returns non-strings unchanged', () => {
    expect(cleanText(123)).toBe(123);
  });

  test('hashText produces consistent SHA-256', () => {
    const a = hashText('hello');
    const b = hashText('hello');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  test('smartQuotesToAscii converts known characters', () => {
    expect(smartQuotesToAscii('‘’“”—…')).toBe("''\"\"-...");
  });
});
