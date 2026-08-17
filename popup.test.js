/**
 * @jest-environment jsdom
 */

// ─── Chrome API Mock ──────────────────────────────────────────────────────────
global.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.1.0' }),
    sendMessage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(),
      remove: jest.fn()
    },
    onChanged: { addListener: jest.fn() }
  },
  tabs: {
    create: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
    remove: jest.fn(),
    onRemoved: { addListener: jest.fn() }
  },
  downloads: { download: jest.fn() },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: { addListener: jest.fn() }
  },
  notifications: { create: jest.fn() }
};

const fs = require('fs');
const path = require('path');

// Load popup.html into the DOM (replaces eval hack)
const html = fs.readFileSync(path.resolve(__dirname, './popup.html'), 'utf8');
document.documentElement.innerHTML = html;

const { generateCredsFromCurrentPattern, isValidEmail, validateBatchItems, parseDelimitedRows } = require('./popup.js');

// ─── isValidEmail ─────────────────────────────────────────────────────────────
describe('isValidEmail', () => {
  test.each([
    ['test@example.com',            true,  'standard valid email'],
    ['user.name+tag@domain.co.uk',  true,  'complex valid email'],
    ['invalid-email',               false, 'missing @ and domain'],
    ['@missinguser.com',            false, 'missing local part'],
    ['missingdomain@.com',          false, 'missing domain label'],
    ['  spaces@test.com  ',         true,  'trims surrounding spaces'],
    ['',                            false, 'empty string'],
    [null,                          false, 'null input']
  ])('%s → %s (%s)', (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});

// ─── generateCredsFromCurrentPattern ─────────────────────────────────────────
describe('generateCredsFromCurrentPattern', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="passPattern" value="{F}@{f}#$1970" />';
  });

  test.each([
    ['John Doe',             'JOHNDOE',            'J@j#$1970', 'John',        'Doe'],
    ['John Middle Doe',      'JOHNMIDDLE',          'J@j#$1970', 'John Middle', 'Doe'],
    ['SingleName',           'SINGLENAMESINGLENAME', 'S@s#$1970', 'SingleName',  ''],
    ['  Trimmed   Spaces  ', 'TRIMMEDSPACES',       'T@t#$1970', 'Trimmed',     'Spaces']
  ])('%s → user=%s pass=%s', (input, expectedUser, expectedPass, expectedFirst, expectedLast) => {
    const creds = generateCredsFromCurrentPattern(input);
    expect(creds).not.toBeNull();
    expect(creds.username).toBe(expectedUser);
    expect(creds.password).toBe(expectedPass);
    expect(creds.firstName).toBe(expectedFirst);
    expect(creds.lastName).toBe(expectedLast);
  });

  test('returns null for empty name', () => {
    expect(generateCredsFromCurrentPattern('')).toBeNull();
    expect(generateCredsFromCurrentPattern('   ')).toBeNull();
  });

  test('uses custom pattern from DOM input', () => {
    document.body.innerHTML = '<input id="passPattern" value="{F}{L}2024!" />';
    const creds = generateCredsFromCurrentPattern('Ahmed Nasser');
    expect(creds.password).toBe('AN2024!');
  });
});

// ─── parseDelimitedRows ───────────────────────────────────────────────────────
describe('parseDelimitedRows', () => {
  test('parses standard CSV into rows', () => {
    const csv = 'Name,Email\nJohn,john@test.com\n"Jane Doe",jane@test.com';
    const rows = parseDelimitedRows(csv);
    expect(rows).toEqual([
      ['Name', 'Email'],
      ['John', 'john@test.com'],
      ['Jane Doe', 'jane@test.com']
    ]);
  });

  test('handles CRLF line endings', () => {
    const csv = 'Name,Email\r\nJohn,john@test.com\r\n';
    const rows = parseDelimitedRows(csv);
    expect(rows).toEqual([['Name', 'Email'], ['John', 'john@test.com']]);
  });

  test('strips BOM character', () => {
    const csv = '\uFEFFName,Email\nJohn,john@test.com';
    const rows = parseDelimitedRows(csv);
    expect(rows[0][0]).toBe('Name'); // BOM removed
  });

  test('handles quoted fields with commas', () => {
    const csv = '"Last, First",email@test.com';
    const rows = parseDelimitedRows(csv);
    expect(rows[0][0]).toBe('Last, First');
  });

  test('handles escaped quotes inside quoted fields', () => {
    const csv = '"He said ""hello""",email@test.com';
    const rows = parseDelimitedRows(csv);
    expect(rows[0][0]).toBe('He said "hello"');
  });

  test('empty input returns empty array', () => {
    expect(parseDelimitedRows('')).toEqual([]);
    expect(parseDelimitedRows(null)).toEqual([]);
  });

  test('skips rows where all cells are empty', () => {
    const csv = 'Name,Email\n\n\nJohn,john@test.com';
    const rows = parseDelimitedRows(csv);
    // Empty rows are filtered out
    expect(rows.every(r => r.some(Boolean))).toBe(true);
  });
});

// ─── validateBatchItems ───────────────────────────────────────────────────────
describe('validateBatchItems', () => {
  test('valid items with no issues', () => {
    const items = [
      { name: 'John', email: 'john@test.com' },
      { name: 'Jane', email: 'jane@test.com' }
    ];
    const stats = validateBatchItems(items);
    expect(stats.valid).toBe(2);
    expect(stats.hasBlockingIssues).toBe(false);
  });

  test('missing email flags blocking issue', () => {
    const items = [
      { name: 'John', email: 'john@test.com' },
      { name: 'Jane', email: '' }
    ];
    const stats = validateBatchItems(items);
    expect(stats.missingEmail).toBe(1);
    expect(stats.valid).toBe(1);
    expect(stats.hasBlockingIssues).toBe(true);
  });

  test('invalid email format flags blocking issue', () => {
    const items = [{ name: 'John', email: 'not-an-email' }];
    const stats = validateBatchItems(items);
    expect(stats.invalidEmail).toBe(1);
    expect(stats.hasBlockingIssues).toBe(true);
  });

  test('exact duplicates are detected but not blocking', () => {
    const items = [
      { name: 'John', email: 'john@test.com' },
      { name: 'John', email: 'john@test.com' }
    ];
    const stats = validateBatchItems(items);
    expect(stats.exactDuplicates).toBe(1);
    expect(stats.hasBlockingIssues).toBe(false);
  });

  test('duplicate names (different emails) are warned but not blocking', () => {
    const items = [
      { name: 'John', email: 'john1@test.com' },
      { name: 'John', email: 'john2@test.com' }
    ];
    const stats = validateBatchItems(items);
    expect(stats.duplicateNames).toBe(1);
    expect(stats.hasBlockingIssues).toBe(false);
  });

  test('long names (>40 chars) are flagged', () => {
    const items = [{ name: 'A'.repeat(41), email: 'x@x.com' }];
    const stats = validateBatchItems(items);
    expect(stats.longNames).toBe(1);
  });

  test('empty list has blocking issues', () => {
    const stats = validateBatchItems([]);
    expect(stats.hasBlockingIssues).toBe(true);
  });
});
