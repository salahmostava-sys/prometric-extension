/**
 * @jest-environment node
 */

const {
  parseDelimitedRows,
  parseCSV,
  decodeXml,
  colIndex
} = require('./parsers.js');

// ─── parseDelimitedRows ───────────────────────────────────────────────────────
describe('parseDelimitedRows', () => {
  test('basic two-column CSV', () => {
    const rows = parseDelimitedRows('Name,Email\nJohn,john@x.com');
    expect(rows).toEqual([['Name', 'Email'], ['John', 'john@x.com']]);
  });

  test('CRLF line endings', () => {
    const rows = parseDelimitedRows('A,B\r\n1,2\r\n');
    expect(rows).toEqual([['A', 'B'], ['1', '2']]);
  });

  test('strips BOM', () => {
    const rows = parseDelimitedRows('\uFEFFName,Email\nJohn,john@x.com');
    expect(rows[0][0]).toBe('Name');
  });

  test('quoted field with comma', () => {
    expect(parseDelimitedRows('"Last, First",a@b.com')[0][0]).toBe('Last, First');
  });

  test('escaped double-quote inside quoted field', () => {
    expect(parseDelimitedRows('"Say ""hi""",a@b.com')[0][0]).toBe('Say "hi"');
  });

  test('empty input → empty array', () => {
    expect(parseDelimitedRows('')).toEqual([]);
    expect(parseDelimitedRows(null)).toEqual([]);
  });
});

// ─── parseCSV ────────────────────────────────────────────────────────────────
describe('parseCSV', () => {
  test('skips header row when Name/Email present', () => {
    const rows = parseCSV('Name,Email\nJohn,john@x.com\nJane,jane@x.com');
    expect(rows.length).toBe(2);
    expect(rows[0][0]).toBe('John');
  });

  test('includes all rows when no header', () => {
    const rows = parseCSV('John,john@x.com\nJane,jane@x.com');
    expect(rows.length).toBe(2);
  });

  test('filters rows with fewer than 2 columns', () => {
    const rows = parseCSV('Name,Email\nJohn,john@x.com\nAlone');
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
    expect(decodeXml(input)).toBe(expected);
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
    expect(colIndex(col)).toBe(expected);
  });
});
