/**
 * @jest-environment jsdom
 */

// Mock Chrome API Boundary (Rule 2)
global.chrome = {
  runtime: {
    getManifest: () => ({ version: '1.0.0' }),
    sendMessage: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(keys => Promise.resolve({})),
      set: jest.fn(),
      remove: jest.fn()
    },
    onChanged: { addListener: jest.fn() }
  }
};

const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, './popup.html'), 'utf8');
document.documentElement.innerHTML = html;

const { generateCredsFromCurrentPattern, isValidEmail, validateBatchItems, parseDelimitedRows } = require('./popup.js');

describe('isValidEmail', () => {
  // Rule 3: Data-driven for variants
  // Rule 5: Name tests for the scenario
  test.each([
    ['test@example.com', true],
    ['user.name+tag@domain.co.uk', true],
    ['invalid-email', false],
    ['@missinguser.com', false],
    ['missingdomain@.com', false],
    ['  spaces@test.com  ', true], // trims spaces
    ['', false],
    [null, false]
  ])('test_email_format_%s_returns_%s', (input, expected) => {
    // Rule 1: Test behavior (returns correct boolean)
    expect(isValidEmail(input)).toBe(expected);
  });
});

describe('generateCredsFromCurrentPattern', () => {
  beforeEach(() => {
    // Setup necessary DOM element for generateCredsFromCurrentPattern
    document.body.innerHTML = '<input id="passPattern" value="{F}@{f}#$1970" />';
  });

  test.each([
    ['John Doe', 'JOHNDOE', 'J@j#$1970', 'John', 'Doe'],
    ['John Middle Doe', 'JOHNMIDDLE', 'J@j#$1970', 'John Middle', 'Doe'],
    ['SingleName', 'SINGLENAMESINGLENAME', 'S@s#$1970', 'SingleName', ''],
    ['  Trimmed   Spaces  ', 'TRIMMEDSPACES', 'T@t#$1970', 'Trimmed', 'Spaces']
  ])('test_name_format_%s_generates_correct_credentials', (input, expectedUser, expectedPass, expectedFirst, expectedLast) => {
    const creds = generateCredsFromCurrentPattern(input);
    expect(creds.username).toBe(expectedUser);
    expect(creds.password).toBe(expectedPass);
    expect(creds.firstName).toBe(expectedFirst);
    expect(creds.lastName).toBe(expectedLast);
  });
});

describe('parseDelimitedRows', () => {
  test('test_standard_csv_parses_into_rows_and_columns', () => {
    const csv = 'Name,Email\nJohn,john@test.com\n"Jane Doe",jane@test.com';
    const rows = parseDelimitedRows(csv);
    expect(rows).toEqual([
      ['Name', 'Email'],
      ['John', 'john@test.com'],
      ['Jane Doe', 'jane@test.com']
    ]);
  });

  test('test_empty_input_returns_empty_array', () => {
    expect(parseDelimitedRows('')).toEqual([]);
    expect(parseDelimitedRows(null)).toEqual([]);
  });
});

describe('validateBatchItems', () => {
  test('test_batch_with_missing_emails_flags_blocking_issues', () => {
    const items = [
      { name: 'John', email: 'john@test.com' },
      { name: 'Jane', email: '' } // Missing email
    ];
    const stats = validateBatchItems(items);
    expect(stats.missingEmail).toBe(1);
    expect(stats.valid).toBe(1);
    expect(stats.hasBlockingIssues).toBe(true);
  });

  test('test_exact_duplicates_are_detected', () => {
    const items = [
      { name: 'John', email: 'john@test.com' },
      { name: 'John', email: 'john@test.com' }
    ];
    const stats = validateBatchItems(items);
    expect(stats.exactDuplicates).toBe(1);
    expect(stats.hasBlockingIssues).toBe(false);
  });
});
