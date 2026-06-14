/**
 * @jest-environment node
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

// Stub crypto for makeQueueId
global.crypto = {
  getRandomValues: (arr) => { arr[0] = 42; return arr; }
};

// Load background.js (it registers listeners on module load, that's fine)
require('./background.js');

// ─── generateCredentials (inlined in background.js) ───────────────────────────
// Access via the global scope that background.js defines it in
describe('generateCredentials', () => {
  test.each([
    ['John Doe',        'JOHNDOE',            'J@j#$1970', 'John',        'Doe'],
    ['Ahmed Ali Nasser','AHMEDALI',            'A@a#$1970', 'Ahmed Ali',   'Nasser'],
    ['SingleName',      'SINGLENAMESINGLENAME', 'S@s#$1970', 'SingleName',  ''],
  ])('name=%s → user=%s pass=%s', (name, user, pass) => {
    const creds = global.generateCredentials(name);
    expect(creds.username).toBe(user);
    expect(creds.password).toBe(pass);
  });

  test('returns null for empty name', () => {
    expect(global.generateCredentials('')).toBeNull();
    expect(global.generateCredentials('   ')).toBeNull();
  });
});

// ─── isRetryableFailure ───────────────────────────────────────────────────────
describe('isRetryableFailure', () => {
  test('returns false if retryable=false', () => {
    expect(global.isRetryableFailure(false, '', '')).toBe(false);
  });
  test('returns true if retryable=true', () => {
    expect(global.isRetryableFailure(true, '', '')).toBe(true);
  });
  test('username exhausted is not retryable', () => {
    expect(global.isRetryableFailure(undefined, 'username exhausted', '')).toBe(false);
  });
  test('timeout is retryable', () => {
    expect(global.isRetryableFailure(undefined, 'timeout waiting for page', '')).toBe(true);
  });
  test('page detection failure is retryable', () => {
    expect(global.isRetryableFailure(undefined, 'could not detect page', 'page')).toBe(true);
  });
  test('duplicate is not retryable', () => {
    expect(global.isRetryableFailure(undefined, '', 'duplicate')).toBe(false);
  });
});

// ─── dedupeItems ─────────────────────────────────────────────────────────────
describe('dedupeItems', () => {
  test('removes exact name+email duplicates', () => {
    const items = [
      { name: 'John', email: 'john@test.com' },
      { name: 'John', email: 'john@test.com' }, // duplicate
      { name: 'Jane', email: 'jane@test.com' }
    ];
    const { unique, skipped } = global.dedupeItems(items);
    expect(unique.length).toBe(2);
    expect(skipped).toBe(1);
  });

  test('keeps different email same name', () => {
    const items = [
      { name: 'John', email: 'john1@test.com' },
      { name: 'John', email: 'john2@test.com' }
    ];
    const { unique, skipped } = global.dedupeItems(items);
    expect(unique.length).toBe(2);
    expect(skipped).toBe(0);
  });

  test('is case-insensitive for dedup key', () => {
    const items = [
      { name: 'JOHN DOE', email: 'JOHN@TEST.COM' },
      { name: 'john doe', email: 'john@test.com' }
    ];
    const { unique, skipped } = global.dedupeItems(items);
    expect(unique.length).toBe(1);
    expect(skipped).toBe(1);
  });

  test('handles empty array', () => {
    const { unique, skipped } = global.dedupeItems([]);
    expect(unique).toEqual([]);
    expect(skipped).toBe(0);
  });
});

// ─── itemDedupKey ─────────────────────────────────────────────────────────────
describe('itemDedupKey', () => {
  test('normalises whitespace and case', () => {
    const k1 = global.itemDedupKey({ name: '  JOHN  DOE  ', email: ' JOHN@TEST.COM ' });
    const k2 = global.itemDedupKey({ name: 'john doe', email: 'john@test.com' });
    expect(k1).toBe(k2);
  });
});
