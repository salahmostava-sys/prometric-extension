// -- Init ---
const { version } = chrome.runtime.getManifest();
const versionBadge = document.getElementById('versionBadge');
if (versionBadge) versionBadge.textContent = 'v' + version;

const DEFAULT_SETTINGS = {
  pageDelay: 1,
  userDelay: 2,
  autoSubmit: true,   // Auto-complete without user clicking — credentials saved to popup
  autoRetry: true,
  stabilityMode: false,
  desktopNotifications: true,
  defAddress: 'Al-Alameya',
  defCity: 'JEDDAH',
  defState: 'JEDDAH',
  defPostal: '00000',
  defCountry: 'Saudi Arabia',
  defAnswer: 'a',
  passPattern: '{F}@{f}#$1970',
  sheetUrl: ''
};

// -- Theme Toggle ---
async function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    document.getElementById('themeToggle').textContent = 'Dark';
  } else {
    document.body.classList.remove('light-mode');
    document.getElementById('themeToggle').textContent = 'Light';
  }
}

document.getElementById('themeToggle')?.addEventListener('click', async () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  await chrome.storage.local.set({ lightMode: isLight });
});

chrome.storage.local.get(['lightMode'], ({ lightMode }) => {
  if (lightMode !== undefined) applyTheme(lightMode);
});

// -- Speed Toggle ---
async function applySpeedMode(isTurbo) {
  const btn = document.getElementById('speedToggle');
  if (!btn) return;
  if (isTurbo) {
    btn.textContent = 'Turbo';
    btn.style.color = 'var(--yellow)';
    btn.style.borderColor = 'var(--yellow)';
    const pD = document.getElementById('pageDelay');
    const uD = document.getElementById('userDelay');
    if (pD) pD.value = 0.2;
    if (uD) uD.value = 0.5;
  } else {
    btn.textContent = 'Safe';
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'var(--green)';
    const pD = document.getElementById('pageDelay');
    const uD = document.getElementById('userDelay');
    if (pD) pD.value = 2.5;
    if (uD) uD.value = 6;
  }
}

document.getElementById('speedToggle')?.addEventListener('click', async () => {
  const { speedMode } = await chrome.storage.local.get(['speedMode']);
  const newTurbo = speedMode === 'safe'; // if it was safe, make it turbo (default is turbo)
  
  applySpeedMode(newTurbo);
  await chrome.storage.local.set({ 
    speedMode: newTurbo ? 'turbo' : 'safe',
    pageDelay: newTurbo ? 0.2 : 2.5,
    userDelay: newTurbo ? 0.5 : 6
  });
});

chrome.storage.local.get(['speedMode'], ({ speedMode }) => {
  applySpeedMode(speedMode !== 'safe'); // default to turbo
});

// -- Copy helper: works even when popup is closing ---
function fallbackCopyPopup(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(e) { console.warn(e); }
  document.body.removeChild(ta);
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

// -- Utilities ---
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

function showMessage(el, type, text) {
  if (!el) return;
  el.className = `msg ${type}`;
  el.textContent = text;
  el.style.display = text ? 'block' : 'none';
}

function validateBatchItems(items) {
  const seenNames = new Set();
  const seenEmails = new Set();
  const seenExact = new Set();
  const stats = {
    total: items.length,
    valid: 0,
    missingEmail: 0,
    invalidEmail: 0,
    duplicateNames: 0,
    duplicateEmails: 0,
    exactDuplicates: 0,
    longNames: 0
  };

  items.forEach(item => {
    const name = String(item.name || '').trim();
    const email = String(item.email || '').trim();
    const nameKey = name.toLowerCase();
    const emailKey = email.toLowerCase();
    const exactKey = `${nameKey}|${emailKey}`;
    let ok = !!name;

    if (!email) {
      stats.missingEmail++;
      ok = false;
    } else if (!isValidEmail(email)) {
      stats.invalidEmail++;
      ok = false;
    }

    if (name.length > 40) stats.longNames++;
    if (nameKey && seenNames.has(nameKey)) stats.duplicateNames++;
    if (emailKey && seenEmails.has(emailKey)) stats.duplicateEmails++;
    if (nameKey && emailKey && seenExact.has(exactKey)) stats.exactDuplicates++;
    if (nameKey) seenNames.add(nameKey);
    if (emailKey) seenEmails.add(emailKey);
    if (nameKey && emailKey) seenExact.add(exactKey);
    if (ok) stats.valid++;
  });

  stats.hasBlockingIssues = stats.total === 0 || stats.missingEmail > 0 || stats.invalidEmail > 0;
  return stats;
}

function renderValidation(panel, body, statusEl, stats) {
  if (!panel || !body || !statusEl) return;
  panel.classList.add('show');
  statusEl.textContent = stats.hasBlockingIssues ? 'Needs review' : 'Ready';
  body.innerHTML = [
    ['Total rows', stats.total],
    ['Valid rows', stats.valid],
    ['Missing email', stats.missingEmail, stats.missingEmail ? 'errline' : ''],
    ['Invalid email', stats.invalidEmail, stats.invalidEmail ? 'errline' : ''],
    ['Duplicate names', stats.duplicateNames, stats.duplicateNames ? 'warn' : ''],
    ['Duplicate emails', stats.duplicateEmails, stats.duplicateEmails ? 'warn' : ''],
    ['Exact duplicates removed', stats.exactDuplicates, stats.exactDuplicates ? 'warn' : ''],
    ['Long names', stats.longNames, stats.longNames ? 'warn' : '']
  ].map(([label, value, cls]) => `
    <div class="validation-row ${cls || ''}">
      <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

// -- sendMsg: retry once if service worker was sleeping (MV3) ---
async function sendMsg(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (e) {
    if (e?.message?.includes('Receiving end does not exist')) {
      // Service worker was asleep — wait briefly and retry once
      await new Promise(r => setTimeout(r, 300));
      try { return await chrome.runtime.sendMessage(payload); } catch (e) { console.warn(e); }
    }
  }
}

async function confirmReplaceRunning() {
  const { isRunning, singleRunning, queue = [] } = await chrome.storage.local.get(['isRunning', 'singleRunning', 'queue']);
  if (!isRunning && !singleRunning) return true;
  const isBatch = isRunning && queue.length > 1;
  const msg = isBatch
    ? `A batch is already running with ${queue.length} queued item(s). Stop it and start a new one?`
    : 'A single registration is already running. Stop it and start a new one?';
  if (!confirm(msg)) return false;
  await sendMsg({ action: 'clearSession' });
  return true;
}

async function clearCurrentSession() {
  if (!confirm('Clear the current session only? History and settings will be kept.')) return;
  await sendMsg({ action: 'clearSession' });
  batchItems = [];
  queueWrap.style.display = 'none';
  bStart.disabled = true;
  fileInput.value = '';
  if (typeof renderLogs === 'function') renderLogs();
  location.reload();
}

function genCreds(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;
  
  // Clean parts to keep only alphabetical letters for the username
  const cleanedParts = parts.map(p => p.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  const uPart1 = cleanedParts[0] || 'USER';
  const uPart2 = cleanedParts[1] || uPart1;
  const username = (uPart1 + uPart2).toUpperCase();
  
  // Password generation from pattern
  const patternInput = document.getElementById('passPattern');
  let pattern = patternInput ? patternInput.value : '{F}@{f}#$1970';
  
  const F = parts[0][0].toUpperCase();
  const f = F.toLowerCase();
  const L = parts[parts.length-1][0].toUpperCase();
  const l = L.toLowerCase();

  const password = pattern
    .replace(/{F}/g, F)
    .replace(/{f}/g, f)
    .replace(/{L}/g, L)
    .replace(/{l}/g, l);
  
  let firstName = parts[0];
  let idx = 1;
  // Fill first name greedily, leaving exactly one last word for last name
  while (idx < parts.length - 1) {
     firstName += ' ' + parts[idx];
     idx++;
  }
  
  let lastName = parts.slice(idx).join(' ');
  
  // Zero truncation! Both names remain 100% complete.
  const needsBypass = (firstName.length > 20 || lastName.length > 20);

  return { username, password, firstName, lastName, needsBypass };
}

// -- Tabs ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('pane-' + tab.dataset.tab).classList.add('active');
  });
});

// -- Settings ---
const SETTINGS_KEYS = ['pageDelay', 'userDelay', 'autoSubmit', 'defAddress', 'defCity', 'defState', 'defPostal', 'defCountry', 'defAnswer', 'passPattern', 'sheetUrl', 'desktopNotifications', 'autoRetry', 'stabilityMode'];

async function loadSettings() {
  const settings = await chrome.storage.local.get(SETTINGS_KEYS);
  
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    const value = val ?? DEFAULT_SETTINGS[id] ?? '';
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
  };

  setVal('pageDelay', settings.pageDelay);
  setVal('userDelay', settings.userDelay);
  setVal('autoSubmit', settings.autoSubmit);
  setVal('autoRetry', settings.autoRetry);
  setVal('stabilityMode', settings.stabilityMode);
  setVal('desktopNotifications', settings.desktopNotifications);
  setVal('defAddress', settings.defAddress);
  setVal('defCity', settings.defCity);
  setVal('defState', settings.defState);
  setVal('defPostal', settings.defPostal);
  setVal('defCountry', settings.defCountry);
  setVal('defAnswer', settings.defAnswer);
  setVal('passPattern', settings.passPattern);
  setVal('sheetUrl', settings.sheetUrl);
}

// -- Settings Actions ---
document.getElementById('saveSettings')?.addEventListener('click', async () => {
  const btn = document.getElementById('saveSettings');
  const data = {};
  SETTINGS_KEYS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    data[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  await chrome.storage.local.set(data);
  updateSinglePreview();
  
  const oldText = btn.textContent;
  btn.textContent = 'OK Saved!';
  btn.style.background = 'var(--green2)';
  setTimeout(() => { btn.textContent = oldText; btn.style.background = ''; }, 2000);
});

document.getElementById('cancelSettings')?.addEventListener('click', () => {
  loadSettings();
  // Switch back to single tab
  const singleTab = document.querySelector('.tab[data-tab="single"]');
  if (singleTab) singleTab.click();
});

document.getElementById('resetSettings')?.addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults?')) return;
  await chrome.storage.local.set(DEFAULT_SETTINGS);
  await loadSettings();
  updateSinglePreview();
  alert('Settings reset to defaults.');
});

// -- Settings Backup & Restore ---
document.getElementById('exportSettingsBtn')?.addEventListener('click', async () => {
  const backupMsgEl = document.getElementById('settingsBackupMsg');
  showMessage(backupMsgEl, '', '');
  try {
    const settings = await chrome.storage.local.get(SETTINGS_KEYS);
    const fullSettings = {};
    SETTINGS_KEYS.forEach(key => {
      fullSettings[key] = settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    });
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `prometric_settings_backup_${dateStr}.json`;
    const jsonContent = JSON.stringify(fullSettings, null, 2);
    
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    showMessage(backupMsgEl, 'ok', 'Settings exported successfully!');
    setTimeout(() => showMessage(backupMsgEl, '', ''), 3000);
  } catch (err) {
    console.error(err);
    showMessage(backupMsgEl, 'err', 'Failed to export settings.');
  }
});

document.getElementById('importSettingsBtn')?.addEventListener('click', () => {
  document.getElementById('importSettingsFile')?.click();
});

document.getElementById('importSettingsFile')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const backupMsgEl = document.getElementById('settingsBackupMsg');
  showMessage(backupMsgEl, '', '');
  
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON format.');
      }
      
      const importedKeys = Object.keys(parsed);
      const validKeys = importedKeys.filter(k => SETTINGS_KEYS.includes(k));
      
      if (validKeys.length === 0) {
        throw new Error('No valid settings keys found in JSON.');
      }
      
      const dataToSave = {};
      SETTINGS_KEYS.forEach(key => {
        if (parsed[key] !== undefined) {
          const defaultType = typeof DEFAULT_SETTINGS[key];
          let val = parsed[key];
          
          if (defaultType === 'number') {
            val = Number(val);
            if (isNaN(val)) return;
          } else if (defaultType === 'boolean') {
            val = Boolean(val);
          } else if (defaultType === 'string') {
            val = String(val);
          }
          dataToSave[key] = val;
        }
      });
      
      if (Object.keys(dataToSave).length === 0) {
        throw new Error('Settings keys contain invalid values.');
      }
      
      await chrome.storage.local.set(dataToSave);
      await loadSettings();
      if (typeof updateSinglePreview === 'function') {
        updateSinglePreview();
      }
      
      showMessage(backupMsgEl, 'ok', 'Settings imported successfully!');
      setTimeout(() => showMessage(backupMsgEl, '', ''), 3000);
    } catch (err) {
      console.error(err);
      showMessage(backupMsgEl, 'err', 'Import failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  
  reader.onerror = () => {
    showMessage(backupMsgEl, 'err', 'Failed to read file.');
    e.target.value = '';
  };
  
  reader.readAsText(file);
});

document.getElementById('clearAllData')?.addEventListener('click', async () => {
  if (!confirm('Warning Are you sure? This will delete History and Active Queues, but KEEP your Settings.')) return;
  const toClear = ['history', 'queue', 'queueIndex', 'currentItem', 'isRunning', 'singleRunning', 'savedCreds', 'copiedCreds', 'currentTabId', 'currentProcessingId', 'activeQueueId', 'lastDedupeSkipped', 'runLogs'];
  await chrome.storage.local.remove(toClear);
  location.reload();
});

// -- SINGLE MODE ---
const sName        = document.getElementById('sName');
const sEmail       = document.getElementById('sEmail');
const sStart       = document.getElementById('sStart');
const sMsg         = document.getElementById('sMsg');

const scNamePanel = document.getElementById('scName');
const scUserPanel = document.getElementById('scUser');
const scPassPanel = document.getElementById('scPass');
const savedCredsPanel = document.getElementById('savedCredsPanel');

function updateSinglePreview() {
  const c = genCreds(sName.value);
  const emailOk = sEmail.value.trim().length > 0;
  sStart.disabled = !(c && emailOk);
}
sName.addEventListener('input', updateSinglePreview);
sEmail.addEventListener('input', updateSinglePreview);

sStart.addEventListener('click', async () => {
  const c = genCreds(sName.value);
  if (!c) return;
  if (!(await confirmReplaceRunning())) return;
  // Do NOT pre-save savedCreds here — the panel should only appear once
  // registration fully completes. background.js saves the real finalUsername
  // via stepDone, which is the only moment we want the panel to show.
  const { defAddress, defCity, defState, defPostal, defCountry } = await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);
  
  await sendMsg({
    action: 'startSingle',
    item: { 
      name: sName.value.trim(), 
      email: sEmail.value.trim(), 
      mailingAddress: defAddress || 'Al-Alameya', 
      city: defCity || 'JEDDAH', 
      state: defState || 'JEDDAH', 
      postalCode: defPostal || '00000', 
      country: defCountry || 'Saudi Arabia' 
    }
  });
  
  sMsg.className = 'msg ok';
  sMsg.textContent = 'OK Opened! Filling in progress...';
  sMsg.style.display = 'block';
  
  sStart.style.display = 'none';
});

// -- BATCH MODE - CSV/Excel parser ---
let batchItems = [];

function parseDelimitedRows(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  const src = String(text || '').replace(/^\uFEFF/, '');

  const pushCell = () => { row.push(cur.trim()); cur = ''; };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '"') {
      if (inQ && next === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      pushCell();
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && next === '\n') i++;
      pushRow();
    } else {
      cur += ch;
    }
  }
  pushRow();
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
    if (entity.startsWith('&#x')) return String.fromCodePoint(parseInt(entity.slice(3, -1), 16));
    if (entity.startsWith('&#')) return String.fromCodePoint(parseInt(entity.slice(2, -1), 10));
    return entity;
  });
}

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

async function extractZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const dec   = new TextDecoder('utf-8', { fatal: false });
  const entries = {};
  let pos = 0;
  while (pos < bytes.length - 4) {
    if (bytes[pos] === 0x50 && bytes[pos+1] === 0x4B && bytes[pos+2] === 0x03 && bytes[pos+3] === 0x04) {
      const compression = bytes[pos+8]  | (bytes[pos+9]  << 8);
      const compSize    = bytes[pos+18] | (bytes[pos+19] << 8) | (bytes[pos+20] << 16) | (bytes[pos+21] << 24);
      const fnLen       = bytes[pos+26] | (bytes[pos+27] << 8);
      const extraLen    = bytes[pos+28] | (bytes[pos+29] << 8);
      const nameStart   = pos + 30;
      const name        = dec.decode(bytes.slice(nameStart, nameStart + fnLen));
      const dataStart   = nameStart + fnLen + extraLen;
      const compData    = bytes.slice(dataStart, dataStart + compSize);

      if (compression === 0) {
        entries[name] = dec.decode(compData);
      } else if (compression === 8) {
        try {
          const ds     = new DecompressionStream('deflate-raw');
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
          let off = 0; for (const c of chunks) { out.set(c, off); off += c.length; }
          entries[name] = dec.decode(out);
        } catch (e) { console.warn(e); }
      }
      pos = dataStart + compSize;
    } else pos++;
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

      if (type === 's') cellValue = shared[parseInt(value, 10)] || '';
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
    console.warn(e);
    return [];
  }
}

const fileInput     = document.getElementById('fileInput');
const uploadArea    = document.getElementById('uploadArea');
const queueWrap     = document.getElementById('queueWrap');
const queueList     = document.getElementById('queueList');
const qCount        = document.getElementById('qCount');
const exportQueueBtn = document.getElementById('exportQueue');
const bStart         = document.getElementById('bStart');
const pauseBatchBtn  = document.getElementById('globalPauseBatch');
const resumeBatchBtn = document.getElementById('globalResumeBatch');
const cancelBatchBtn = document.getElementById('globalStopBatch');
const bMsg          = document.getElementById('bMsg');
const batchBanner   = document.getElementById('globalBatchBanner');
const batchSpinner  = document.getElementById('globalBatchSpinner');
const batchProgress = document.getElementById('globalBatchProgress');
const retryFailedBtn = document.getElementById('retryFailed');
const clearSessionBtn = document.getElementById('clearSession');
const batchValidation = document.getElementById('batchValidation');
const batchValidationBody = document.getElementById('batchValidationBody');
const batchValidationStatus = document.getElementById('batchValidationStatus');
const batchLogPanel = document.getElementById('batchLogPanel');
const batchLogs = document.getElementById('batchLogs');

function setBatchControlsState(state) {
  if (bStart) bStart.style.display = state === 'idle' ? 'block' : 'none';
  if (pauseBatchBtn) pauseBatchBtn.style.display = state === 'running' ? 'block' : 'none';
  if (resumeBatchBtn) resumeBatchBtn.style.display = state === 'paused' ? 'block' : 'none';
  if (cancelBatchBtn) cancelBatchBtn.style.display = (state === 'running' || state === 'paused') ? 'block' : 'none';
  if (batchSpinner) batchSpinner.style.display = state === 'running' ? 'block' : 'none';
  if (batchBanner && state === 'idle') batchBanner.classList.remove('show');
}

uploadArea.addEventListener('dragover',  e => { e.preventDefault(); uploadArea.classList.add('drag'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag'));
uploadArea.addEventListener('drop',      e => { e.preventDefault(); uploadArea.classList.remove('drag'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change',     () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

async function handleFile(file) {
  if (!file) return;
  bMsg.style.display = 'none';
  let rows = [];

  const fname = file.name.toLowerCase();
  if (fname.endsWith('.csv')) {
    const text = await file.text();
    rows = parseCSV(text);
  } else if (fname.endsWith('.xlsx')) {
    // parseXLSX handles the OOXML (.xlsx) ZIP/DEFLATE format.
    const buf = await file.arrayBuffer();
    rows = await parseXLSX(buf);
  } else if (fname.endsWith('.xls')) {
    // Legacy binary .xls (BIFF format) is NOT supported by our parser.
    // The outer check already catches .xlsx before reaching here, so this
    // branch is exclusively for the old binary format.
    showMessage(bMsg, 'err', 'Legacy .xls format is not supported. Please save your file as .xlsx or .csv and try again.');
    return;
  } else {
    showMessage(bMsg, 'err', 'Unsupported file type. Use .csv or .xlsx');
    return;
  }

  if (!rows.length) {
    bMsg.className = 'msg err';
    bMsg.textContent = 'Error No data found. Check your file format.';
    bMsg.style.display = 'block';
    return;
  }

  // FIX #4: Read saved settings instead of using hardcoded defaults.
  const { defAddress, defCity, defState, defPostal, defCountry } =
    await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);

  batchItems = rows.map(r => ({
    name:           (r[0] || '').trim(),
    email:          (r[1] || '').trim(),
    status:         'pending',
    mailingAddress: defAddress || 'Al-Alameya',
    city:           defCity    || 'JEDDAH',
    state:          defState   || 'JEDDAH',
    postalCode:     defPostal  || '00000',
    country:        defCountry || 'Saudi Arabia'
  })).filter(i => i.name);

  const stats = validateBatchItems(batchItems);
  renderValidation(batchValidation, batchValidationBody, batchValidationStatus, stats);
  renderQueue();
  queueWrap.style.display = 'block';
  bStart.disabled = batchItems.length === 0 || stats.hasBlockingIssues;
  if (stats.hasBlockingIssues) {
    showMessage(bMsg, 'err', 'Fix missing or invalid emails before starting the batch.');
  }
  
  setBatchControlsState('idle');
}

function renderQueue() {
  qCount.textContent = `${batchItems.length} people`;
  queueList.innerHTML = batchItems.map((item, i) => `
    <div class="queue-item" id="qi-${i}">
      <div class="q-dot ${item.status}" id="qd-${i}"></div>
      <div style="flex:1;min-width:0">
        <div class="q-name">${escapeHtml(item.name)}</div>
        <div class="q-email">${escapeHtml(item.failureReason || item.email)}</div>
      </div>
      <div class="q-status ${item.status}" id="qs-${i}">${statusLabel(item.status)}</div>
    </div>`).join('');
}

function statusLabel(s) {
  return { pending: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed' }[s] || s;
}

function downloadRowsAsCSV(rows, filename) {
  const csvContent = rows.map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

document.getElementById('clearQueue').addEventListener('click', () => {
  batchItems = [];
  queueWrap.style.display = 'none';
  bStart.disabled = true;
  fileInput.value = '';
  if (batchValidation) batchValidation.classList.remove('show');
  
  setBatchControlsState('idle');
  bMsg.style.display = 'none';
});

exportQueueBtn?.addEventListener('click', async () => {
  const { queue = [] } = await chrome.storage.local.get(['queue']);
  const source = queue.length ? queue : batchItems;
  if (!source.length) return;

  const rows = [
    ['Name', 'Email', 'Username', 'Password', 'Status', 'Reason', 'Failure Kind', 'Retryable', 'URL', 'Step', 'Snippet'],
    ...source.map(item => {
      const creds = genCreds(item.name || '');
      return [
        item.name || '',
        item.email || '',
        item.finalUsername || creds?.username || '',
        item.password || creds?.password || '',
        item.status || 'pending',
        item.failureReason || '',
        item.failureKind || '',
        item.retryable === undefined ? '' : String(item.retryable),
        item.failureUrl || '',
        item.failureStep || '',
        item.pageSnippet || ''
      ];
    })
  ];
  downloadRowsAsCSV(rows, `prometric_queue_${new Date().toISOString().slice(0,10)}.csv`);
});

bStart.addEventListener('click', async () => {
  if (!(await confirmReplaceRunning())) return;
  const stats = validateBatchItems(batchItems);
  renderValidation(batchValidation, batchValidationBody, batchValidationStatus, stats);
  if (stats.hasBlockingIssues) {
    showMessage(bMsg, 'err', 'Batch has missing or invalid emails. Fix the file first.');
    return;
  }
  const { defAddress, defCity, defState, defPostal, defCountry } = await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);
  const items = batchItems.map(i => ({
    ...i,
    mailingAddress: defAddress || 'Al-Alameya',
    city:           defCity    || 'JEDDAH',
    state:          defState   || 'JEDDAH',
    postalCode:     defPostal  || '00000',
    country:        defCountry || 'Saudi Arabia'
  }));
  await sendMsg({ action: 'startQueue', items });
  batchBanner.classList.add('show');
  
  setBatchControlsState('running');
  
  showMessage(bMsg, 'ok', `Started ${batchItems.length} registrations.`);
  if (stats.exactDuplicates) {
    showMessage(bMsg, 'ok', `Started ${batchItems.length - stats.exactDuplicates} registrations. Removed ${stats.exactDuplicates} exact duplicate row(s).`);
  }
});

pauseBatchBtn?.addEventListener('click', async () => {
  // pauseQueue: only sets isRunning=false, queue is preserved for resume.
  await sendMsg({ action: 'pauseQueue' });
  setBatchControlsState('paused');
  showMessage(bMsg, 'ok', 'Batch paused. Click Resume to continue.');
});

resumeBatchBtn?.addEventListener('click', async () => {
  await sendMsg({ action: 'resumeQueue' });
  setBatchControlsState('running');
  showMessage(bMsg, 'ok', 'Resuming batch registration.');
});

cancelBatchBtn?.addEventListener('click', async () => {
  await sendMsg({ action: 'clearSession' });
  setBatchControlsState('idle');
  if (sStart) sStart.style.display = 'block';
  showMessage(bMsg, 'err', 'Execution stopped and queue cleared.');
});

retryFailedBtn?.addEventListener('click', async () => {
  if (!(await confirmReplaceRunning())) return;
  await sendMsg({ action: 'retryFailed' });
  showMessage(bMsg, 'ok', 'Retrying failed registrations.');
});

clearSessionBtn?.addEventListener('click', clearCurrentSession);
document.getElementById('clearCurrentSessionSettings')?.addEventListener('click', clearCurrentSession);
document.getElementById('clearLogs')?.addEventListener('click', async () => {
  await chrome.storage.local.set({ runLogs: [] });
  renderLogs([]);
});

function renderLogs(logs = null) {
  if (!batchLogPanel || !batchLogs) return;
  if (!logs || logs.length === 0) {
    batchLogPanel.classList.remove('show');
    batchLogs.innerHTML = '';
    return;
  }
  batchLogPanel.classList.add('show');
  batchLogs.innerHTML = logs.slice(0, 50).map(log => {
    const t = log.date ? new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="log-item">
        <div class="log-time">${escapeHtml(t)}</div>
        <div class="log-text" title="${escapeHtml(log.message || '')}">${escapeHtml(log.message || '')}</div>
      </div>
    `;
  }).join('');
}

// -- Poll status ---
function updateSingleModeUI(singleRunning) {
  const titleEl = document.getElementById('globalBatchTitle');
  if (singleRunning) {
    if (batchBanner) {
      batchBanner.style.display = 'flex';
      batchBanner.style.background = 'rgba(210,153,34,.1)';
      batchBanner.style.borderColor = 'rgba(210,153,34,.3)';
    }
    if (titleEl) {
      titleEl.textContent = 'Single Registration Running...';
      titleEl.style.color = 'var(--green)';
    }
    if (batchProgress) {
      batchProgress.style.color = 'var(--yellow)';
      batchProgress.textContent = 'Automating Prometric registration...';
    }
    
    if (sStart) sStart.style.display = 'none';
    if (resumeBatchBtn) resumeBatchBtn.style.display = 'none';
    if (pauseBatchBtn) pauseBatchBtn.style.display = 'none';
    if (cancelBatchBtn) cancelBatchBtn.style.display = 'block';
    if (batchSpinner) batchSpinner.style.display = 'block';
  } else {
    if (sStart) sStart.style.display = 'block';
  }
}

function updateQueueItemsUI(queue, queueIndex, isRunning) {
  queue.forEach((item, i) => {
    const dot  = document.getElementById(`qd-${i}`);
    const stat = document.getElementById(`qs-${i}`);
    if (!dot || !stat) return;
    let s;
    if (item.status === 'done' || item.status === 'failed') {
      s = item.status;
    } else if (i === queueIndex && isRunning) {
      s = 'running';
    } else if (i < queueIndex) {
      s = item.status || 'done';
    } else {
      s = 'pending';
    }
    dot.className  = `q-dot ${s}`;
    stat.className = `q-status ${s}`;
    stat.textContent = statusLabel(s);
  });
}

function updateBatchModeRunningUI(queueLength, queueIndex) {
  const titleEl = document.getElementById('globalBatchTitle');
  if (batchBanner) {
    batchBanner.style.display = 'flex';
    batchBanner.style.background = 'rgba(210,153,34,.1)';
    batchBanner.style.borderColor = 'rgba(210,153,34,.3)';
  }
  if (titleEl) {
    titleEl.textContent = 'Batch Registration Running...';
    titleEl.style.color = 'var(--green)';
  }
  if (batchProgress) {
    batchProgress.style.color = 'var(--yellow)';
    batchProgress.textContent = `Processing ${Math.min(queueIndex + 1, queueLength)} of ${queueLength}...`;
  }
  
  bStart.style.display = 'none';
  if (resumeBatchBtn) resumeBatchBtn.style.display = 'none';
  if (pauseBatchBtn) pauseBatchBtn.style.display = 'block';
  if (cancelBatchBtn) cancelBatchBtn.style.display = 'block';
  if (batchSpinner) batchSpinner.style.display = 'block';
  if (retryFailedBtn) retryFailedBtn.style.display = 'none';
}

function updateBatchModePausedUI(queue, queueIndex, isRunning) {
  const titleEl = document.getElementById('globalBatchTitle');
  const pendingItems = queue.slice(queueIndex).filter(it => it.status === 'pending');
  const hasPending   = pendingItems.length > 0 && queueIndex < queue.length;
  
  bStart.style.display = 'none';
  if (pauseBatchBtn) pauseBatchBtn.style.display = 'none';
  if (batchSpinner) batchSpinner.style.display = 'none';
  
  if (hasPending) {
    if (batchBanner) {
      batchBanner.style.display = 'flex';
      batchBanner.style.background = 'rgba(56,139,253,.08)';
      batchBanner.style.borderColor = 'rgba(56,139,253,.3)';
    }
    if (titleEl) {
      titleEl.textContent = 'Batch Paused';
      titleEl.style.color = 'var(--yellow)';
    }
    if (batchProgress) {
      batchProgress.style.color = 'var(--blue)';
      batchProgress.textContent = `Queue paused - ${pendingItems.length} remaining`;
    }
    if (resumeBatchBtn) resumeBatchBtn.style.display = 'block';
    if (cancelBatchBtn) cancelBatchBtn.style.display = 'block';
  } else {
    if (batchBanner) batchBanner.style.display = 'none';
    if (resumeBatchBtn) resumeBatchBtn.style.display = 'none';
    if (cancelBatchBtn) cancelBatchBtn.style.display = 'none';
    bStart.style.display = 'block';
  }
  const failedCount = queue.filter(it => it.status === 'failed').length;
  if (retryFailedBtn) retryFailedBtn.style.display = failedCount > 0 && !isRunning ? 'block' : 'none';
}

async function pollStatus() {
  const { queue, queueIndex, isRunning, singleRunning, runLogs = [] } = await chrome.storage.local.get(['queue', 'queueIndex', 'isRunning', 'singleRunning', 'runLogs']);
  renderLogs(runLogs);

  updateSingleModeUI(singleRunning);

  if (!queue || queue.length === 0) {
    if (retryFailedBtn) retryFailedBtn.style.display = 'none';
    if (clearSessionBtn) clearSessionBtn.style.display = 'none';
    if (!singleRunning && batchBanner) batchBanner.style.display = 'none';
    return;
  }

  const queueChanged = queue.length === batchItems.length && queue.some((it, i) =>
    it.status !== batchItems[i]?.status ||
    it.finalUsername !== batchItems[i]?.finalUsername ||
    it.failureReason !== batchItems[i]?.failureReason
  );
  
  if (isRunning || singleRunning || batchItems.length === 0 || queueChanged) {
    batchItems = queue;
    renderQueue();
    queueWrap.style.display = 'block';
    bStart.disabled = true;
  }
  if (clearSessionBtn) clearSessionBtn.style.display = queue.length > 0 ? 'block' : 'none';

  if (queue.length > 0 && !singleRunning) {
    updateQueueItemsUI(queue, queueIndex, isRunning);

    if (isRunning) {
      updateBatchModeRunningUI(queue.length, queueIndex);
    } else {
      updateBatchModePausedUI(queue, queueIndex, isRunning);
    }
  }
}

// -- Reactive updates via storage.onChanged (replaces most of the polling) ---
chrome.storage.onChanged.addListener((changes) => {
  // Any queue/running state change → refresh status immediately
  if (changes.queue || changes.queueIndex || changes.isRunning ||
      changes.singleRunning || changes.runLogs) {
    pollStatus();
  }
  // Saved credentials change → refresh panel immediately
  if (changes.savedCreds) {
    loadSavedCreds();
  }
  // History change → refresh only if the tab is visible
  if (changes.history) {
    const histPane = document.getElementById('pane-history');
    if (histPane?.classList.contains('active')) loadHistory();
  }
});

// Fallback interval (5s) catches edge-cases where onChanged misses a tick
setInterval(pollStatus, 5000);
pollStatus();

// -- HISTORY TAB ---
async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get(['history']);
  const list    = document.getElementById('histList');
  const countEl = document.getElementById('histCount');
  const analyticsWrap = document.getElementById('histAnalytics');
  if (!list) return;

  countEl.textContent = `${history.length} record${history.length !== 1 ? 's' : ''}`;

  if (history.length === 0) {
    if (analyticsWrap) analyticsWrap.style.display = 'none';
    list.innerHTML = '<div class="hist-empty">No registrations yet</div>';
    return;
  }

  // Calculate Today's Stats
  const today = new Date().toDateString();
  let todaySuccess = 0;
  let todayFail = 0;
  
  history.forEach(h => {
    if (h.date && new Date(h.date).toDateString() === today) {
      if (h.status === 'done') todaySuccess++;
      else if (h.status === 'failed') todayFail++;
    }
  });

  if (analyticsWrap) {
    analyticsWrap.style.display = 'block';
    document.getElementById('statSuccess').textContent = todaySuccess;
    document.getElementById('statFail').textContent = todayFail;
  }

  list.innerHTML = history.map((h, i) => `
    <div class="hist-item">
      <div class="hist-name" title="${escapeHtml(h.reason || h.name || '')}">${escapeHtml(h.name || '-')}</div>
      <div class="hist-user" title="${escapeHtml(h.finalUsername || '')}">${escapeHtml(h.finalUsername || '-')}</div>
      <div class="hist-pass" title="${escapeHtml(h.password || '')}">${escapeHtml(h.password || '-')}</div>
      <div style="text-align:right;white-space:nowrap">
        <span class="hist-badge ${escapeHtml(h.status)}" title="${escapeHtml(h.reason || (h.date ? new Date(h.date).toLocaleString('en-GB') : ''))}">${h.status === 'done' ? 'OK' : 'Fail'}</span>
        ${h.status === 'done' ? `<button class="hist-copy" data-index="${i}" title="Copy Credentials">
          <svg class="pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>` : ''}
      </div>
    </div>`).join('');
}

document.getElementById('clearHist')?.addEventListener('click', async () => {
  if (!confirm('Clear all history?')) return;
  await chrome.storage.local.set({ history: [] });
  loadHistory();
});

document.querySelectorAll('.tab').forEach(tab => {
  if (tab.dataset.tab === 'history') tab.addEventListener('click', loadHistory);
});

loadHistory();

// -- Saved Credentials Panel ---
async function loadSavedCreds() {
  const { savedCreds } = await chrome.storage.local.get(['savedCreds']);

  // Only show after registration completes (username is filled by stepDone in background.js)
  if (savedCreds && savedCreds.username) {
    if (scNamePanel) scNamePanel.textContent = savedCreds.name     || '';
    if (scUserPanel) scUserPanel.textContent = savedCreds.username || '';
    if (scPassPanel) scPassPanel.textContent = savedCreds.password || '';
    if (savedCredsPanel) savedCredsPanel.style.display = 'block';
  } else {
    if (savedCredsPanel) savedCredsPanel.style.display = 'none';
  }
}

// -- Global Event Delegation ---
document.addEventListener('click', async (e) => {
  // Handle history copy
  if (e.target.classList.contains('hist-copy')) {
    const i = e.target.dataset.index;
    const { history = [] } = await chrome.storage.local.get(['history']);
    const h = history[i];
    if (h) fallbackCopyPopup(`${h.finalUsername}\t${h.password}`);
    const btn = e.target;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `<svg class="pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => btn.innerHTML = oldHtml, 2000);
  }
  
  // Handle saved creds copy
  if (e.target.classList.contains('sc-copy')) {
    const id = e.target.dataset.copy;
    const text = document.getElementById(id)?.textContent || '';
    fallbackCopyPopup(text);
    const btn = e.target;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `<svg class="pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => btn.innerHTML = oldHtml, 2000);
  }
});

loadSavedCreds();
// Fallback only — primary updates come from storage.onChanged above
setInterval(loadSavedCreds, 10000);

// -- History Export ---
document.getElementById('exportCSV')?.addEventListener('click', async () => {
  const btn = document.getElementById('exportCSV');
  const { history = [] } = await chrome.storage.local.get(['history']);
  if (!history.length) return;

  const oldText = btn.textContent;
  btn.textContent = 'Generating...';
  btn.disabled = true;

  try {
    // History is unshifted (newest first), so reverse it to keep original registration order
    const exportData = [...history].reverse();
    const rows = [
      ['Name', 'Email', 'Username', 'Password', 'Status', 'Reason', 'Failure Kind', 'URL', 'Step', 'Date'],
      ...exportData.map(h => [
        h.name || '',
        h.email || '',
        h.finalUsername || h.username || '',
        h.password || '',
        h.status || '',
        h.reason || '',
        h.failureKind || '',
        h.url || '',
        h.step || '',
        h.date ? new Date(h.date).toLocaleString() : ''
      ])
    ];

    downloadRowsAsCSV(rows, `prometric_batch_${new Date().toISOString().slice(0,10)}.csv`);
  } catch (e) {
    console.error('Export failed:', e);
    alert('Export failed. Check console for details.');
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
});

// -- Template Download ---
document.getElementById('downloadTemplate')?.addEventListener('click', () => {
  const csv  = 'Name,Email\nJOHN SMITH,john.smith@example.com\nSARAH JONES,sarah.jones@example.com';
  chrome.downloads.download({
    url: 'data:text/csv;base64,' + btoa(csv),
    filename: 'prometric_template.csv',
    saveAs: false
  });
});

// -- Google Sheet Integration ---
let sheetData = [];
let excludedSheetRows = new Set();

function parseCSVLine(line) {
  return parseDelimitedRows(line)[0] || [];
}

function showSheetError(msg) {
  const el = document.getElementById('sheetMsg');
  if(el) {
    showMessage(el, msg ? 'err' : '', msg);
  }
}

document.getElementById('sheetFetch')?.addEventListener('click', async () => {
  const btn = document.getElementById('sheetFetch');
  const url = document.getElementById('sheetUrl').value.trim();
  await chrome.storage.local.set({ sheetUrl: url });
  
  const m = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return showSheetError('Invalid Google Sheet URL. Make sure you copy the full link.');
  const id = m[1];
  
  let gid = '0';
  const gm = url.match(/[#&]gid=([0-9]+)/);
  if (gm) gid = gm[1];

  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  
  btn.textContent = 'Generating';
  btn.disabled = true;
  showSheetError('');
  
  try {
    const res = await fetch(exportUrl);
    if (!res.ok) throw new Error('Cannot read sheet. Ensure share settings are "Anyone with the link can view".');
    
    const text = await res.text();
    const rows = parseDelimitedRows(text);
    if (rows.length < 2) throw new Error('Sheet is empty or has only one row.');

    excludedSheetRows.clear();

    const headers = rows[0];
    sheetData = rows.slice(1);

    const nameSel = document.getElementById('sheetNameCol');
    const emailSel = document.getElementById('sheetEmailCol');
    if (nameSel) nameSel.innerHTML = '';
    if (emailSel) emailSel.innerHTML = '';

    const daySel = document.getElementById('sheetDayCol');
    if (daySel) daySel.innerHTML = '<option value="-1">- No filter -</option>';

    headers.forEach((h, i) => {
      const opt = `<option value="${i}">${escapeHtml(h || 'Unnamed Column')}</option>`;
      nameSel.innerHTML += opt;
      emailSel.innerHTML += opt;
      if (daySel) daySel.innerHTML += opt;
    });

    const hl = headers.map(h => (h||'').toLowerCase());
    const nIdx = hl.findIndex(h => h.includes('\u0627\u0633\u0645') || h.includes('name') || h.includes('\u0647\u0648\u064a\u0629'));
    const eIdx = hl.findIndex(h => h.includes('email') || h.includes('\u0628\u0631\u064a\u062f'));
    const dIdx = hl.findIndex(h => h.includes('day') || h.includes('\u064a\u0648\u0645'));
    
    if (nIdx >= 0) nameSel.value = nIdx;
    if (eIdx >= 0) emailSel.value = eIdx;
    else if (headers.length > 1) emailSel.value = 1;
    if (daySel && dIdx >= 0) { daySel.value = dIdx; buildDayFilter(dIdx); }

    if (daySel) daySel.onchange = () => buildDayFilter(parseInt(daySel.value));

    document.getElementById('sheetCols').style.display = 'block';
    document.getElementById('sheetStart').disabled = false;
  } catch (e) {
    showSheetError(e.message);
  } finally {
    btn.textContent = 'Load Columns';
    btn.disabled = false;
  }
});

function renderSheetPreview() {
  const wrap  = document.getElementById('sheetPreviewWrap');
  const count = document.getElementById('sheetPreviewCount');
  const list  = document.getElementById('sheetPreviewList');
  
  const nIdx = parseInt(document.getElementById('sheetNameCol').value);
  const eIdx = parseInt(document.getElementById('sheetEmailCol').value);
  const daySel = document.getElementById('sheetDayCol');
  const dIdx = daySel ? parseInt(daySel.value) : -1;

  if (isNaN(nIdx) || isNaN(eIdx)) {
    wrap.style.display = 'none';
    document.getElementById('sheetStart').disabled = true;
    return;
  }

  const selectedDays = new Set([...document.querySelectorAll('.day-badge.selected')].map(b => b.dataset.day.toLowerCase()));

  let items = sheetData.map((cols, origIndex) => ({
    origIndex,
    name: cols[nIdx] || '', 
    email: cols[eIdx] || '',
    day: dIdx >= 0 ? (cols[dIdx] || '').trim() : ''
  })).filter(item => item.name.length >= 2 && !excludedSheetRows.has(item.origIndex));

  if (dIdx >= 0 && selectedDays.size > 0) {
    items = items.filter(item => selectedDays.has(item.day.toLowerCase()));
  }

  if (items.length === 0) {
    wrap.style.display = 'none';
    document.getElementById('sheetStart').disabled = true;
    return;
  }

  wrap.style.display = 'block';
  const stats = validateBatchItems(items);
  document.getElementById('sheetStart').disabled = items.length === 0 || stats.hasBlockingIssues;
  count.textContent = `${items.length} Names Found`;
  
  if (stats.hasBlockingIssues) {
    showSheetError(`Sheet check: ${stats.missingEmail} missing email, ${stats.invalidEmail} invalid email.`);
  } else {
    showSheetError('');
  }

  // Limit preview to 100 items to avoid lagging the popup
  const previewItems = items.slice(0, 100);
  list.innerHTML = previewItems.map((item, i) => {
    const c = genCreds(item.name);
    return `
    <div class="sheet-grid" style="padding:6px 12px;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
      <div style="font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(item.email)}">${escapeHtml(item.email)}</div>
      <div style="font-family:monospace;color:var(--blue);font-size:11px">${escapeHtml(c ? c.username : '')}</div>
      <div style="font-family:monospace;color:var(--yellow);font-size:11px">${escapeHtml(c ? c.password : '')}</div>
      <div style="text-align:right">
        <button class="delete-row-btn" data-idx="${item.origIndex}" style="background:transparent;border:none;color:var(--red);cursor:pointer;padding:0 5px;display:inline-flex;align-items:center;justify-content:center;transition:var(--transition)" title="Exclude from batch">
          <svg class="pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    </div>`;
  }).join('') + (items.length > 100 ? `<div style="text-align:center;padding:8px;color:var(--muted);font-size:11px">...and ${items.length - 100} more</div>` : '');

  list.querySelectorAll('.delete-row-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.dataset.idx);
      excludedSheetRows.add(idx);
      renderSheetPreview();
    });
  });
}

document.getElementById('sheetNameCol')?.addEventListener('change', renderSheetPreview);
document.getElementById('sheetEmailCol')?.addEventListener('change', renderSheetPreview);

async function processSheetStart() {
  if (!(await confirmReplaceRunning())) return;
  const nIdx = parseInt(document.getElementById('sheetNameCol').value);
  const eIdx = parseInt(document.getElementById('sheetEmailCol').value);
  const daySel = document.getElementById('sheetDayCol');
  const dIdx = daySel ? parseInt(daySel.value) : -1;
  
  if (isNaN(nIdx) || isNaN(eIdx)) return showSheetError('Please select valid columns.');

  const selectedDays = new Set([...document.querySelectorAll('.day-badge.selected')].map(b => b.dataset.day.toLowerCase()));

  let items = sheetData.map((cols, origIndex) => ({
    origIndex,
    name: cols[nIdx] || '', 
    email: cols[eIdx] || '',
    day: dIdx >= 0 ? (cols[dIdx] || '').trim() : ''
  })).filter(item => item.name.length >= 2 && !excludedSheetRows.has(item.origIndex));

  if (dIdx >= 0 && selectedDays.size > 0) {
    items = items.filter(item => selectedDays.has(item.day.toLowerCase()));
  }

  if (items.length === 0) return showSheetError('No valid names found matching the selected filters.');
  const stats = validateBatchItems(items);
  if (stats.hasBlockingIssues) {
    return showSheetError(`Sheet check failed: ${stats.missingEmail} missing email, ${stats.invalidEmail} invalid email.`);
  }

  const { defAddress, defCity, defState, defPostal, defCountry } = await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);

  // Pre-fill default fields for batch
  items = items.map(i => ({
    ...i,
    status:         'pending',
    mailingAddress: defAddress || 'Al-Alameya',
    city:           defCity || 'JEDDAH',
    state:          defState || 'JEDDAH',
    postalCode:     defPostal || '00000',
    country:        defCountry || 'Saudi Arabia'
  }));

  await sendMsg({ action: 'startQueue', items });
  if (batchBanner) batchBanner.classList.add('show');
  
  setBatchControlsState('running');
  
  const sheetMsgEl = document.getElementById('sheetMsg');
  if (sheetMsgEl) {
    showMessage(sheetMsgEl, 'ok', `Started ${items.length} registrations.`);
    if (stats.exactDuplicates) {
      showMessage(sheetMsgEl, 'ok', `Started ${items.length - stats.exactDuplicates} registrations. Removed ${stats.exactDuplicates} exact duplicate row(s).`);
    }
  }
}

document.getElementById('sheetStart')?.addEventListener('click', processSheetStart);

// Build day filter checkboxes from selected column
function buildDayFilter(dIdx) {
  const filterWrap  = document.getElementById('sheetDayFilter');
  const badgesWrap  = document.getElementById('sheetDayBadges');
  if (!filterWrap || !badgesWrap) return;
  
  if (dIdx < 0) { filterWrap.style.display = 'none'; renderSheetPreview(); return; }

  const days = [...new Set(sheetData.map(r => (r[dIdx] || '').trim()).filter(Boolean))];
  if (days.length === 0) { filterWrap.style.display = 'none'; renderSheetPreview(); return; }

  badgesWrap.innerHTML = days.map(day => `
    <button class="day-badge selected" data-day="${escapeHtml(day)}"
      style="padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;
             background:rgba(56,139,253,.2);color:var(--blue);border:1px solid rgba(56,139,253,.4);
             transition:.15s">
      ${escapeHtml(day)}
    </button>`).join('');

  filterWrap.style.display = 'block';

  badgesWrap.querySelectorAll('.day-badge').forEach(btn => {
    btn.addEventListener('click', () => {
      const active = btn.classList.toggle('selected');
      btn.style.background = active ? 'rgba(56,139,253,.2)' : 'transparent';
      btn.style.color      = active ? 'var(--blue)'         : 'var(--muted)';
      btn.style.borderColor= active ? 'rgba(56,139,253,.4)': 'var(--border)';
      renderSheetPreview();
    });
  });
  renderSheetPreview();
}

// -- Clipboard Banner - shows last copied creds for 30 seconds ---
let clipInterval = null;

async function checkClipboard() {
  const { copiedCreds } = await chrome.storage.local.get(['copiedCreds']);
  const banner  = document.getElementById('clipBanner');
  const textEl  = document.getElementById('clipText');
  const circle  = document.getElementById('clipTimerCircle');
  const copyBtn = document.getElementById('clipCopyBtn');

  if (!banner) return;

  if (!copiedCreds || Date.now() >= copiedCreds.expiresAt) {
    banner.classList.remove('show');
    if (clipInterval) { clearInterval(clipInterval); clipInterval = null; }
    return;
  }

  // Show banner
  banner.classList.add('show');
  const remaining = Math.max(0, copiedCreds.expiresAt - Date.now());
  const pct = remaining / 30000; // 0->1
  const circumference = 72; // 2pir approx 72 for r=11.5
  if (circle) circle.style.strokeDashoffset = circumference * (1 - pct);

  const secs = Math.ceil(remaining / 1000);
  if (textEl) textEl.textContent = `Copy ${copiedCreds.label || 'Credentials copied'} (${secs}s)`;

  // Copy Again button
  if (copyBtn && !copyBtn._bound) {
    copyBtn._bound = true;
    copyBtn.addEventListener('click', () => {
      fallbackCopyPopup(copiedCreds.text);
      copyBtn.textContent = 'OK Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy Again', 3000);
    });
  }
}

// Poll every second
setInterval(checkClipboard, 1000);
checkClipboard();
loadSettings();
