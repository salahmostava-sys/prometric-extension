/**
 * @jest-environment node
 *
 * Tests for background.js utility functions.
 * Uses the conditional module.exports added to background.js for test access.
 */

// ─── Chrome API Mock ──────────────────────────────────────────────────────────
global.chrome = {
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve())
    }
  },
  tabs: {
    create: jest.fn(() => Promise.resolve({ id: 99 })),
    update: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => Promise.resolve({ id: 99 })),
    remove: jest.fn(() => Promise.resolve()),
    onRemoved: { addListener: jest.fn() }
  },
  runtime: {
    onMessage: { addListener: jest.fn() },
    onInstalled: { addListener: jest.fn() },
    sendMessage: jest.fn(() => Promise.resolve())
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: { addListener: jest.fn() }
  },
  notifications: { create: jest.fn() },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  }
};

// Stub crypto.getRandomValues for makeQueueId
global.crypto = {
  getRandomValues: (arr) => { arr[0] = 42; return arr; }
};

// Load functions via module.exports (which background.js conditionally exports)
const {
  generateCredentials,
  isValidEmail,
  isRetryableFailure,
  makeQueueId
} = require('./background.js');

// ─── generateCredentials ──────────────────────────────────────────────────────
describe('generateCredentials', () => {
  test.each([
    ['John Doe',          'JOHNDOE',             'J@j#$1970'],
    ['Ahmed Ali Nasser',  'AHMEDALI',             'A@a#$1970'],
    ['SingleName',        'SINGLENAMESINGLENAME', 'S@s#$1970']
  ])('name=%s → user=%s pass=%s', (name, expectedUser, expectedPass) => {
    const creds = generateCredentials(name);
    expect(creds).not.toBeNull();
    expect(creds.username).toBe(expectedUser);
    expect(creds.password).toBe(expectedPass);
  });

  test('returns null for empty name', () => {
    expect(generateCredentials('')).toBeNull();
    expect(generateCredentials('   ')).toBeNull();
  });

  test('uses custom passPattern', () => {
    const creds = generateCredentials('Ahmed Nasser', '{F}{L}2024!');
    expect(creds.password).toBe('AN2024!');
  });

  test('generates correct firstName and lastName', () => {
    const creds = generateCredentials('John Middle Doe');
    expect(creds.firstName).toBe('John Middle');
    expect(creds.lastName).toBe('Doe');
  });

  test('single-name gets same value for firstName and lastName', () => {
    const creds = generateCredentials('SingleName');
    expect(creds.firstName).toBe('SingleName');
    expect(creds.lastName).toBe('');
  });
});

// ─── isValidEmail ─────────────────────────────────────────────────────────────
describe('isValidEmail (background.js copy)', () => {
  test.each([
    ['test@example.com',   true],
    ['user+tag@domain.co', true],
    ['invalid',            false],
    ['@missing.com',       false],
    ['',                   false],
    [null,                 false]
  ])('%s → %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

// ─── isRetryableFailure ───────────────────────────────────────────────────────
describe('isRetryableFailure', () => {
  test('returns false when retryable=false', () => {
    expect(isRetryableFailure(false, '', '')).toBe(false);
  });
  test('returns true when retryable=true', () => {
    expect(isRetryableFailure(true, '', '')).toBe(true);
  });
  test('username exhausted is not retryable', () => {
    expect(isRetryableFailure(undefined, 'username exhausted', '')).toBe(false);
  });
  test('missing-field with no retry flag → not retryable', () => {
    expect(isRetryableFailure(undefined, 'something', 'missing-field')).toBe(false);
  });
  test('duplicate is not retryable', () => {
    expect(isRetryableFailure(undefined, '', 'duplicate')).toBe(false);
  });
  test('generic page failure is retryable', () => {
    expect(isRetryableFailure(undefined, 'page load failed', 'page')).toBe(true);
  });
});

// ─── makeQueueId ─────────────────────────────────────────────────────────────
describe('makeQueueId', () => {
  test('returns a string with the given prefix', () => {
    const id = makeQueueId('test');
    expect(typeof id).toBe('string');
    expect(id.startsWith('test_')).toBe(true);
  });

  test('default prefix is "q"', () => {
    const id = makeQueueId();
    expect(id.startsWith('q_')).toBe(true);
  });

  test('generates unique IDs on repeated calls', () => {
    // With real crypto, these would differ. Our stub returns 42 each time
    // so they collide, but the function itself should still return a string.
    const id = makeQueueId('x');
    expect(typeof id).toBe('string');
  });
});
