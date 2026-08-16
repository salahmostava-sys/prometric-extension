// utils.js - Shared utilities for Prometric Extension
/* exported escapeHtml, isValidEmail, generateCredentials, generateXLSXBlob, downloadRowsAsXLSX */

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function isValidEmail(email) {
  // Safe email regex avoiding super-linear runtime
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(email || '').trim());
}

/**
 * Generate credentials based on the full name and a password pattern.
 * Supports:
 * - {F} / {f}: First letter of first name (upper/lower)
 * - {L} / {l}: First letter of last name (upper/lower)
 * - {FIRST} / {first}: Full first name (upper/lower, alphabetical)
 * - {LAST} / {last}: Full last name (upper/lower, alphabetical)
 * - {YEAR}: Current year (e.g. 2026)
 * - {RAND4}: 4-digit random number
 * - {RAND2}: 2-digit random number
 */
function generateCredentials(name, passPattern = '{F}@{f}#$1970') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;

  // Clean parts to keep only alphabetical letters for the username
  const cleanedParts = parts.map(p => p.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  const uPart1 = cleanedParts[0] || 'USER';
  const uPart2 = cleanedParts[1] || uPart1;
  const username = (uPart1 + uPart2).toUpperCase();

  const F = parts[0][0].toUpperCase();
  const f = F.toLowerCase();
  const L = parts[parts.length-1][0].toUpperCase();
  const l = L.toLowerCase();

  let firstName = parts[0];
  let idx = 1;
  // Fill first name greedily, leaving exactly one last word for last name
  while (idx < parts.length - 1) {
    firstName += ' ' + parts[idx];
    idx++;
  }

  const lastName = parts.slice(idx).join(' ');

  const cleanFirst = firstName.replace(/[^A-Za-z]/g, '') || uPart1;
  const cleanLast  = lastName.replace(/[^A-Za-z]/g, '') || cleanFirst;
  const currentYear = String(new Date().getFullYear());

  // Fixed deterministic pseudo-random or current random digits
  const rand4 = String(Math.floor(1000 + Math.random() * 9000));
  const rand2 = String(Math.floor(10 + Math.random() * 90));

  const password = passPattern
    .replace(/{F}/g, F)
    .replace(/{f}/g, f)
    .replace(/{L}/g, L)
    .replace(/{l}/g, l)
    .replace(/{FIRST}/g, cleanFirst.toUpperCase())
    .replace(/{first}/g, cleanFirst.toLowerCase())
    .replace(/{LAST}/g, cleanLast.toUpperCase())
    .replace(/{last}/g, cleanLast.toLowerCase())
    .replace(/{YEAR}/g, currentYear)
    .replace(/{RAND4}/g, rand4)
    .replace(/{RAND2}/g, rand2);

  // Zero truncation! Both names remain 100% complete.
  const needsBypass = (firstName.length > 20 || lastName.length > 20);

  return { username, password, firstName, lastName, needsBypass };
}

// ─── Pure JS XLSX / ZIP Generator ───────────────────────────────────────────
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0);
}

function createSimpleZip(files) {
  let EncoderClass = typeof TextEncoder !== 'undefined' ? TextEncoder : null;
  if (!EncoderClass && typeof globalThis !== 'undefined' && globalThis.TextEncoder) {
    EncoderClass = globalThis.TextEncoder;
  }
  const encoder = EncoderClass ? new EncoderClass() : {
    encode: (str) => {
      const utf8 = unescape(encodeURIComponent(str));
      const arr = new Uint8Array(utf8.length);
      for (let i = 0; i < utf8.length; i++) arr[i] = utf8.charCodeAt(i);
      return arr;
    }
  };
  const fileEntries = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = typeof content === 'string' ? encoder.encode(content) : content;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0x4500, true);
    view.setUint16(12, 0x5800, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    fileEntries.push({
      nameBytes,
      dataBytes,
      header,
      crc,
      size,
      offset
    });

    offset += header.length + dataBytes.length;
  }

  let cdSize = 0;
  const cdEntries = [];
  for (const f of fileEntries) {
    const cdHeader = new Uint8Array(46 + f.nameBytes.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0x4500, true);
    view.setUint16(14, 0x5800, true);
    view.setUint32(16, f.crc, true);
    view.setUint32(20, f.size, true);
    view.setUint32(24, f.size, true);
    view.setUint16(28, f.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, f.offset, true);
    cdHeader.set(f.nameBytes, 46);

    cdEntries.push(cdHeader);
    cdSize += cdHeader.length;
  }

  const cdOffset = offset;
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, fileEntries.length, true);
  eocdView.setUint16(10, fileEntries.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, cdOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalLength = cdOffset + cdSize + 22;
  const out = new Uint8Array(totalLength);
  let pos = 0;

  for (const f of fileEntries) {
    out.set(f.header, pos);
    pos += f.header.length;
    out.set(f.dataBytes, pos);
    pos += f.dataBytes.length;
  }

  for (const cd of cdEntries) {
    out.set(cd, pos);
    pos += cd.length;
  }

  out.set(eocd, pos);
  return out;
}

function generateXLSXBlob(headers, rows, options = {}) {
  const sheetName = options.sheetName || 'Prometric Registrations';

  let sheetDataXml = '';
  // Row 1: Headers
  sheetDataXml += '<row r="1" spans="1:' + headers.length + '">';
  headers.forEach((h, cIdx) => {
    const colLetter = cIdx < 26 ? String.fromCharCode(65 + cIdx) : 'A' + String.fromCharCode(65 + cIdx - 26);
    sheetDataXml += `<c r="${colLetter}1" s="1" t="inlineStr"><is><t>${escapeHtml(h)}</t></is></c>`;
  });
  sheetDataXml += '</row>';

  // Row 2..N: Data rows
  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 2;
    const statusVal = String(row[4] || row.status || '').toLowerCase();
    let rowStyle = '0';
    if (statusVal === 'done' || statusVal === 'ok') rowStyle = '2';
    else if (statusVal === 'failed' || statusVal === 'fail') rowStyle = '3';

    sheetDataXml += `<row r="${rowNum}" spans="1:${headers.length}">`;
    headers.forEach((_, cIdx) => {
      const colLetter = cIdx < 26 ? String.fromCharCode(65 + cIdx) : 'A' + String.fromCharCode(65 + cIdx - 26);
      const val = row[cIdx] ?? '';
      const cellStyle = (cIdx === 4 && (rowStyle === '2' || rowStyle === '3')) ? rowStyle : '0';
      sheetDataXml += `<c r="${colLetter}${rowNum}" s="${cellStyle}" t="inlineStr"><is><t>${escapeHtml(val)}</t></is></c>`;
    });
    sheetDataXml += '</row>';
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeHtml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11"/><color rgb="FF1A7F37"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11"/><color rgb="FFCF222E"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F6FEB"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDAFBE1"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFEBE9"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    <border>
      <left style="thin"><color rgb="FFD0D7DE"/></left>
      <right style="thin"><color rgb="FFD0D7DE"/></right>
      <top style="thin"><color rgb="FFD0D7DE"/></top>
      <bottom style="thin"><color rgb="FFD0D7DE"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetDataXml}
  </sheetData>
</worksheet>`;

  const zipBytes = createSimpleZip({
    '[Content_Types].xml': contentTypesXml,
    '_rels/.rels': relsXml,
    'xl/_rels/workbook.xml.rels': workbookRelsXml,
    'xl/workbook.xml': workbookXml,
    'xl/styles.xml': stylesXml,
    'xl/worksheets/sheet1.xml': sheetXml
  });

  return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function downloadRowsAsXLSX(headers, rows, filename, options = {}) {
  const blob = generateXLSXBlob(headers, rows, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── Test Exports (Node.js / Jest only) ──────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    isValidEmail,
    generateCredentials,
    createSimpleZip,
    generateXLSXBlob,
    downloadRowsAsXLSX
  };
}

