// parsers.js - File parsing utilities (CSV and XLSX)

function processCharForDelimitedRows(ch, next, state) {
  if (ch === '"') {
    if (state.inQ && next === '"') { state.cur += '"'; state.skipNext = true; }
    else { state.inQ = !state.inQ; }
  } else if (ch === ',' && !state.inQ) {
    state.pushCell();
  } else if ((ch === '\n' || ch === '\r') && !state.inQ) {
    if (ch === '\r' && next === '\n') state.skipNext = true;
    state.pushRow();
  } else {
    state.cur += ch;
  }
}

function parseDelimitedRows(text) {
  const rows = [];
  let row = [];
  const state = {
    cur: '',
    inQ: false,
    skipNext: false,
    pushCell: () => { row.push(state.cur.trim()); state.cur = ''; },
    pushRow: () => {
      state.pushCell();
      if (row.some(Boolean)) rows.push(row);
      row = [];
    }
  };
  const src = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    if (state.skipNext) { state.skipNext = false; continue; }
    processCharForDelimitedRows(src[i], src[i + 1], state);
  }
  state.pushRow();
  return rows;
}

function parseCSV(text) {
  const rows = parseDelimitedRows(text);
  let start = 0;
  const first = (rows[0] || []).join(' ').toLowerCase();
  if (first.includes('name') || first.includes('email')) start = 1;

  return rows.slice(start).filter(c => c.length >= 2 && c[0].trim());
}

function decodeXml(value) {
  return String(value || '').replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity];
    if (entity.startsWith('&#x')) return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16));
    if (entity.startsWith('&#')) return String.fromCodePoint(Number.parseInt(entity.slice(2, -1), 10));
    return entity;
  });
}

// Excel column labels (A=1, Z=26, AA=27…) are base-26 numbers.
// Subtract 64 to map 'A'→1…'Z'→26, accumulate with *26, then subtract 1 for 0-based index.
function colIndex(col) {
  return [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

function textFromCellXml(cellXml) {
  const parts = [];
  for (const m of cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
    parts.push(decodeXml(m[1]));
  }
  return parts.join('');
}

async function decompressDeflate(compData, dec) {
  try {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(compData);
    writer.close();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const out = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0));
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return dec.decode(out);
  } catch (e) {
    throw new Error('Failed to decompress ZIP entry: ' + e.message);
  }
}

function parseZipHeader(bytes, pos, dec) {
  const compression = bytes[pos+8] | (bytes[pos+9] << 8);
  const compSize = bytes[pos+18] | (bytes[pos+19] << 8) | (bytes[pos+20] << 16) | (bytes[pos+21] << 24);
  const fnLen = bytes[pos+26] | (bytes[pos+27] << 8);
  const extraLen = bytes[pos+28] | (bytes[pos+29] << 8);
  const nameStart = pos + 30;
  const name = dec.decode(bytes.slice(nameStart, nameStart + fnLen));
  const dataStart = nameStart + fnLen + extraLen;
  const compData = bytes.slice(dataStart, dataStart + compSize);
  return { compression, name, compData, nextPos: dataStart + compSize };
}

async function extractZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const dec = new TextDecoder('utf-8', { fatal: false });
  const entries = {};
  let pos = 0;
  while (pos < bytes.length - 4) {
    if (bytes[pos] === 0x50 && bytes[pos+1] === 0x4B && bytes[pos+2] === 0x03 && bytes[pos+3] === 0x04) {
      const header = parseZipHeader(bytes, pos, dec);
      if (header.compression === 0) {
        entries[header.name] = dec.decode(header.compData);
      } else if (header.compression === 8) {
        entries[header.name] = await decompressDeflate(header.compData, dec);
      }
      pos = header.nextPos;
    } else {
      pos++;
    }
  }
  return entries;
}

function parseSharedStrings(entries) {
  const shared = [];
  if (entries['xl/sharedStrings.xml']) {
    const items = entries['xl/sharedStrings.xml'].matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g);
    for (const item of items) shared.push(textFromCellXml(item[1]));
  }
  return shared;
}

function parseSheetData(sheetXML, shared) {
  const rows = [];
  const rowMatches = sheetXML.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);
  for (const rm of rowMatches) {
    const cells = [];
    const cellMatches = rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g);
    for (const cm of cellMatches) {
      const attrs = cm[1];
      const body = cm[2];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/);
      const type = attrs.match(/\bt="([^"]*)"/)?.[1] || '';
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
      const idx = ref ? colIndex(ref[1]) : cells.length;
      let cellValue = '';

      if (type === 's') cellValue = shared[Number.parseInt(value, 10)] || '';
      else if (type === 'inlineStr') cellValue = textFromCellXml(body);
      else cellValue = decodeXml(value || textFromCellXml(body));

      cells[idx] = cellValue;
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

async function parseXLSX(buffer) {
  try {
    const entries = await extractZipEntries(buffer);
    const shared = parseSharedStrings(entries);
    const sheetXML = entries['xl/worksheets/sheet1.xml'] || '';
    const rows = parseSheetData(sheetXML, shared);

    let start = 0;
    if (rows[0] && (rows[0][0].toLowerCase().includes('name') || rows[0][1]?.toLowerCase().includes('email'))) start = 1;
    return rows.slice(start).filter(r => r[0]);
  } catch (e) {
    throw new Error('Failed to parse XLSX file: ' + e.message);
  }
}

// ─── Test Exports (Node.js / Jest only) ──────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseDelimitedRows,
    parseCSV,
    decodeXml,
    colIndex,
    parseSharedStrings,
    parseSheetData,
    parseXLSX
  };
}

