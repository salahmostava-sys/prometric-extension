/**
 * @jest-environment jsdom
 */

// Load parsers.js as a module (no eval)
const fs   = require('fs');
const path = require('path');

// Execute parsers.js in the current context so its functions are available
const parsersCode = fs.readFileSync(path.resolve(__dirname, './parsers.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(parsersCode)();

// After execution, functions are globals in the module scope — use them via the evaluated scope
// Re-expose as local references for clarity in tests
const _parseDelimitedRows = parseDelimitedRows; // eslint-disable-line no-undef
const _parseCSV           = parseCSV;           // eslint-disable-line no-undef
const _decodeXml          = decodeXml;          // eslint-disable-line no-undef
const _colIndex           = colIndex;           // eslint-disable-line no-undef

// ─── parseDelimitedRows ───────────────────────────────────────────────────────
describe('parseDelimitedRows', () => {
  test('basic two-column CSV', () => {
    const rows = _parseDelimitedRows('Name,Email\nJohn,john@x.com');
    expect(rows).toEqual([['Name', 'Email'], ['John', 'john@x.com']]);
  });

  test('CRLF line endings', () => {
    const rows = _parseDelimitedRows('A,B\r\n1,2\r\n');
    expect(rows).toEqual([['A', 'B'], ['1', '2']]);
  });

  test('strips BOM', () => {
    const rows = _parseDelimitedRows('\uFEFFName,Email\nJohn,john@x.com');
    expect(rows[0][0]).toBe('Name');
  });

  test('quoted field with comma', () => {
    expect(_parseDelimitedRows('"Last, First",a@b.com')[0][0]).toBe('Last, First');
  });

  test('escaped double-quote inside quoted field', () => {
    expect(_parseDelimitedRows('"Say ""hi""",a@b.com')[0][0]).toBe('Say "hi"');
  });

  test('empty input → empty array', () => {
    expect(_parseDelimitedRows('')).toEqual([]);
    expect(_parseDelimitedRows(null)).toEqual([]);
  });
});

// ─── parseCSV ────────────────────────────────────────────────────────────────
describe('parseCSV', () => {
  test('skips header row when Name/Email present', () => {
    const rows = _parseCSV('Name,Email\nJohn,john@x.com\nJane,jane@x.com');
    expect(rows.length).toBe(2);
    expect(rows[0][0]).toBe('John');
  });

  test('includes all rows when no header', () => {
    const rows = _parseCSV('John,john@x.com\nJane,jane@x.com');
    expect(rows.length).toBe(2);
  });

  test('filters rows with fewer than 2 columns', () => {
    const rows = _parseCSV('Name,Email\nJohn,john@x.com\nAlone');
    // "Alone" row has only 1 non-empty column, should be filtered
    const hasAlone = rows.some(r => r[0] === 'Alone' && !r[1]);
    expect(hasAlone).toBe(false);
  });
});

// ─── decodeXml ───────────────────────────────────────────────────────────────
describe('decodeXml', () => {
  test.each([
    ['&amp;',  '&'],
    ['&lt;',   '<'],
    ['&gt;',   '>'],
    ['&quot;', '"'],
    ['&apos;', "'"],
    ['&#65;',  'A'],   // decimal
    ['&#x41;', 'A'],   // hex
    ['plain text', 'plain text']
  ])('%s → %s', (input, expected) => {
    expect(_decodeXml(input)).toBe(expected);
  });
});

// ─── colIndex ────────────────────────────────────────────────────────────────
describe('colIndex', () => {
  test.each([
    ['A',  0],
    ['B',  1],
    ['Z',  25],
    ['AA', 26],
    ['AB', 27],
    ['AZ', 51]
  ])('column %s → index %i', (col, expected) => {
    expect(_colIndex(col)).toBe(expected);
  });
});
