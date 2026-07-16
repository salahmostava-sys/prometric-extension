// popup.js - Handles the extension popup UI and Google Sheet parsing
const { escapeHtml, isValidEmail, generateCredentials } = require('./utils.js');
const { parseDelimitedRows, parseCSV, decodeXml, parseXLSX } = require('./parsers.js');

// -- Init ---
const { version } = chrome.runtime.getManifest();
const versionBadge = document.getElementById('versionBadge');
if (versionBadge) versionBadge.textContent = 'v' + version;

const DEFAULT_SETTINGS = {
  pageDelay: 1,
  userDelay: 2,
  autoSubmit: true,
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

// ═══ Status Pill ═══
function updateStatusPill(state) {
  const pill = document.getElementById('statusPill');
  const text = document.getElementById('statusPillText');
  if (!pill || !text) return;
  const map = {
    running: { cls: 'running', label: 'Running' },
    paused:  { cls: 'paused',  label: 'Paused'  },
    single:  { cls: 'single',  label: 'Active'  },
    idle:    { cls: 'idle',    label: 'Idle'    }
  };
  const m = map[state] || map.idle;
  pill.className = `status-pill ${m.cls}`;
  text.textContent = m.label;
}

// ═══ Live Credential Preview (Single Tab) ═══
function calcPasswordStrength(pass) {
  if (!pass || pass.length < 4) return { score: 0, label: 'Weak', color: '#ff7b72' };
  let score = 0;
  if (pass.length >= 8)  score++;
  if (pass.length >= 12) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[a-z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  if (score <= 2) return { score: Math.round(score / 6 * 100), label: 'Weak',   color: '#ff7b72' };
  if (score <= 4) return { score: Math.round(score / 6 * 100), label: 'Medium', color: '#d29922' };
  return           { score: Math.round(score / 6 * 100), label: 'Strong', color: '#3fb950' };
}

function renderCredentialPreview(name) {
  const card    = document.getElementById('sPreviewCard');
  const userEl  = document.getElementById('sPreviewUser');
  const passEl  = document.getElementById('sPreviewPass');
  const barEl   = document.getElementById('sStrengthBar');
  const lblEl   = document.getElementById('sStrengthLabel');
  if (!card) return;

  const patternInput = document.getElementById('passPattern');
  const pattern = patternInput ? patternInput.value : '{F}@{f}#$1970';
  const creds = generateCredentials(name, pattern);

  if (!creds) { card.classList.remove('show'); return; }

  card.classList.add('show');
  if (userEl) userEl.textContent = creds.username;
  if (passEl) passEl.textContent = creds.password;

  const { score, label, color } = calcPasswordStrength(creds.password);
  if (barEl) { barEl.style.width = score + '%'; barEl.style.background = color; }
  if (lblEl) { lblEl.textContent = label; lblEl.style.color = color; }
}

// ═══ Progress Bar + Stats Cards ═══
function updateProgressAndStats(queue, queueIndex, isRunning) {
  const wrap      = document.getElementById('batchStatsWrap');
  const fillEl    = document.getElementById('progressBarFill');
  const pctEl     = document.getElementById('progressPct');
  const labelEl   = document.getElementById('progressLabel');
  const doneEl    = document.getElementById('statDone');
  const failedEl  = document.getElementById('statFailed');
  const runningEl = document.getElementById('statRunning');
  const pendingEl = document.getElementById('statPending');
  if (!wrap || !queue || !queue.length) { if (wrap) wrap.style.display = 'none'; return; }

  const done    = queue.filter(i => i.status === 'done').length;
  const failed  = queue.filter(i => i.status === 'failed').length;
  const running = isRunning ? 1 : 0;
  const pending = queue.filter(i => i.status === 'pending').length;
  const finished = done + failed;
  const pct = Math.round((finished / queue.length) * 100);

  wrap.style.display = 'block';
  if (fillEl)    fillEl.style.width = pct + '%';
  if (pctEl)     pctEl.textContent  = pct + '%';
  if (labelEl)   labelEl.textContent = `${finished} / ${queue.length} completed`;
  if (doneEl)    doneEl.textContent   = done;
  if (failedEl)  failedEl.textContent = failed;
  if (runningEl) runningEl.textContent = running;
  if (pendingEl) pendingEl.textContent = pending;
}

// ═══ Enhanced Queue Render ═══
function renderEnhancedQueueItem(item, i) {
  const hasCreds   = item.status === 'done' && (item.finalUsername || item.username);
  const hasFailed  = item.status === 'failed';
  const statusMap  = { pending: 'Waiting', running: 'Running', done: 'Done', failed: 'Failed' };

  const div = document.createElement('div');
  div.className = 'queue-item';
  div.id = `qi-${i}`;

  // Top row
  const top = document.createElement('div');
  top.className = 'queue-item-top';
  top.innerHTML = `
    <div class="q-dot ${item.status}" id="qd-${i}"></div>
    <div style="flex:1;min-width:0">
      <div class="q-name">${escapeHtml(item.name || '')}</div>
      <div class="q-email">${escapeHtml(hasFailed ? (item.failureReason || item.email || '') : (item.email || ''))}</div>
    </div>
    <div class="q-status ${item.status}" id="qs-${i}">${statusMap[item.status] || item.status}</div>
  `;
  div.appendChild(top);

  // Credentials row (shown when done)
  if (hasCreds) {
    const credsRow = document.createElement('div');
    credsRow.className = 'queue-item-creds visible';
    const user = item.finalUsername || item.username || '';
    const pass = item.password || '';
    credsRow.innerHTML = `
      <span class="q-cred-val user" title="${escapeHtml(user)}">${escapeHtml(user)}</span>
      <span class="q-cred-val pass" title="${escapeHtml(pass)}">${escapeHtml(pass)}</span>
      <button class="q-copy q-cred-copy" data-user="${escapeHtml(user)}" data-pass="${escapeHtml(pass)}" title="Copy credentials">
        <svg class="pointer-events-none" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
    `;
    div.appendChild(credsRow);
  }

  // Per-item retry (shown when failed)
  if (hasFailed) {
    const retryWrap = document.createElement('div');
    retryWrap.style.cssText = 'margin-top:5px;text-align:right';
    const retryBtn = document.createElement('button');
    retryBtn.className = 'q-retry-btn';
    retryBtn.dataset.index = i;
    retryBtn.textContent = '↺ Retry';
    retryWrap.appendChild(retryBtn);
    div.appendChild(retryWrap);
  }

  return div;
}

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
  ta.remove();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

// -- Utilities ---

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

function renderValidationRow(label, value, cls) {
  const div = document.createElement('div');
  div.className = `validation-row ${cls || ''}`.trim();
  const span = document.createElement('span');
  span.textContent = String(label);
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  div.appendChild(span);
  div.appendChild(strong);
  return div;
}

function renderValidation(panel, body, statusEl, stats) {
  if (!panel || !body || !statusEl) return;
  panel.classList.add('show');
  statusEl.textContent = stats.hasBlockingIssues ? 'Needs review' : 'Ready';
  body.textContent = '';
  const rows = [
    ['Total rows', stats.total],
    ['Valid rows', stats.valid],
    ['Missing email', stats.missingEmail, stats.missingEmail ? 'errline' : ''],
    ['Invalid email', stats.invalidEmail, stats.invalidEmail ? 'errline' : ''],
    ['Duplicate names', stats.duplicateNames, stats.duplicateNames ? 'warn' : ''],
    ['Duplicate emails', stats.duplicateEmails, stats.duplicateEmails ? 'warn' : ''],
    ['Exact duplicates removed', stats.exactDuplicates, stats.exactDuplicates ? 'warn' : ''],
    ['Long names', stats.longNames, stats.longNames ? 'warn' : '']
  ];
  for (const [label, value, cls] of rows) {
    body.appendChild(renderValidationRow(label, value, cls));
  }
}

/** Wait before retrying a message to a sleeping service worker (MV3). */
const SW_WAKE_RETRY_MS = 300;

// -- sendMsg: retry once if service worker was sleeping (MV3) ---
// Returns { success: false, error } if both attempts fail, so callers can react.
async function sendMsg(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (e) {
    if (e?.message?.includes('Receiving end does not exist')) {
      // Service worker was asleep — wait briefly and retry once
      await new Promise(r => setTimeout(r, SW_WAKE_RETRY_MS));
      try {
        return await chrome.runtime.sendMessage(payload);
      } catch (retryErr) {
        console.warn('[sendMsg] Both attempts failed:', retryErr);
        return { success: false, error: retryErr?.message || 'Unknown error' };
      }
    }
    console.warn('[sendMsg] Unexpected error:', e);
    return { success: false, error: e?.message || 'Unknown error' };
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

// Reads the password pattern from the current DOM input so callers don't
// need to pass it explicitly. Use generateCredentials() directly when the
// pattern is already known (e.g. in background.js).
function generateCredsFromCurrentPattern(name) {
  const patternInput = document.getElementById('passPattern');
  const pattern = patternInput ? patternInput.value : '{F}@{f}#$1970';
  return generateCredentials(name, pattern);
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
            if (Number.isNaN(val)) return;
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
  const patternInput = document.getElementById('passPattern');
  const pattern = patternInput ? patternInput.value : '{F}@{f}#$1970';
  const c = generateCredentials(sName.value, pattern);
  const emailOk = sEmail.value.trim().length > 0;
  sStart.disabled = !(c && emailOk);
  renderCredentialPreview(sName.value.trim());
}
sName.addEventListener('input', updateSinglePreview);
sEmail.addEventListener('input', updateSinglePreview);

sStart.addEventListener('click', async () => {
  const patternInput = document.getElementById('passPattern');
  const pattern = patternInput ? patternInput.value : '{F}@{f}#$1970';
  const c = generateCredentials(sName.value, pattern);
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

// File parsing logic has been moved to parsers.js

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

// ── Paste Names Modal ─────────────────────────────────────────────────────────
const pasteModal       = document.getElementById('pasteModal');
const pasteNamesArea   = document.getElementById('pasteNamesArea');
const pasteEmailDomain = document.getElementById('pasteEmailDomain');
const pasteNamesCount  = document.getElementById('pasteNamesCount');
const pastePreviewBox  = document.getElementById('pastePreviewBox');
const pastePreviewItems= document.getElementById('pastePreviewItems');
const pasteLoadBtn     = document.getElementById('pasteLoadBtn');

// Restore last used domain
pasteEmailDomain.value = localStorage.getItem('pasteEmailDomain') || '';

function openPasteModal() {
  pasteModal.style.display = 'flex';
  pasteNamesArea.value = '';
  pasteNamesCount.textContent = '';
  pastePreviewBox.style.display = 'none';
  pasteLoadBtn.disabled = true;
  setTimeout(() => pasteNamesArea.focus(), 50);
}
function closePasteModal() { pasteModal.style.display = 'none'; }

document.getElementById('pasteNamesBtn')?.addEventListener('click', openPasteModal);
document.getElementById('pasteModalClose')?.addEventListener('click', closePasteModal);
document.getElementById('pasteCancelBtn')?.addEventListener('click', closePasteModal);
pasteModal?.addEventListener('click', e => { if (e.target === pasteModal) closePasteModal(); });

// Generate email from name + domain: "Ahmed Ali Hassan" → "Ahmed.Ali.Hassan@domain"
function nameToEmail(fullName, domain) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('.') + '@' + domain.trim().toLowerCase();
}

// Parse textarea and update preview + count in real time
function updatePastePreview() {
  const domain = pasteEmailDomain.value.trim();
  const lines  = pasteNamesArea.value.split('\n').map(l => l.trim()).filter(Boolean);
  const valid  = lines.filter(l => l.length > 1);

  pasteNamesCount.textContent = valid.length ? `(${valid.length})` : '';
  pasteLoadBtn.disabled = valid.length === 0;

  if (!valid.length) { pastePreviewBox.style.display = 'none'; return; }

  pastePreviewBox.style.display = 'block';
  const preview = valid.slice(0, 3);
  pastePreviewItems.innerHTML = preview.map(name => {
    const email = domain ? nameToEmail(name, domain) : '<span style="color:var(--yellow)">⚠ no domain set</span>';
    return `<div class="paste-preview-row">
      <span class="paste-preview-name">${escapeHtml(name)}</span>
      <span class="paste-preview-email">${typeof email === 'string' && domain ? escapeHtml(email) : email}</span>
    </div>`;
  }).join('');
  if (valid.length > 3) {
    pastePreviewItems.innerHTML += `<div style="font-size:10px;color:var(--muted);margin-top:4px">+${valid.length - 3} more...</div>`;
  }
}

pasteNamesArea?.addEventListener('input',   updatePastePreview);
pasteEmailDomain?.addEventListener('input', () => {
  localStorage.setItem('pasteEmailDomain', pasteEmailDomain.value.trim());
  updatePastePreview();
});

pasteLoadBtn?.addEventListener('click', async () => {
  const domain = pasteEmailDomain.value.trim();
  const lines  = pasteNamesArea.value.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  if (!lines.length) return;

  const rows = lines.map(name => [name, domain ? nameToEmail(name, domain) : '']);
  const settings = await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);
  const newItems = processLoadedRows(rows, settings);

  batchItems = newItems;
  const stats = validateBatchItems(batchItems);
  renderValidation(batchValidation, batchValidationBody, batchValidationStatus, stats);
  renderQueue();
  queueWrap.style.display = 'block';
  bStart.disabled = batchItems.length === 0 || stats.hasBlockingIssues;
  if (stats.hasBlockingIssues) {
    showMessage(bMsg, 'err', 'Fix missing or invalid emails before starting the batch.');
  }
  setBatchControlsState('idle');
  closePasteModal();
  showMessage(bMsg, 'ok', `✓ Loaded ${newItems.length} name${newItems.length !== 1 ? 's' : ''} from paste.`);
});



async function parseFileToRows(file) {
  const fname = file.name.toLowerCase();
  if (fname.endsWith('.csv')) {
    return parseCSV(await file.text());
  }
  if (fname.endsWith('.xlsx')) {
    return parseXLSX(await file.arrayBuffer());
  }
  if (fname.endsWith('.xls')) {
    throw new Error('Legacy .xls format is not supported. Please save your file as .xlsx or .csv and try again.');
  }
  throw new Error('Unsupported file type. Use .csv or .xlsx');
}

function processLoadedRows(rows, settings) {
  const { defAddress, defCity, defState, defPostal, defCountry } = settings;
  return rows.map(r => ({
    name:           (r[0] || '').trim(),
    email:          (r[1] || '').trim(),
    status:         'pending',
    mailingAddress: defAddress || 'Al-Alameya',
    city:           defCity    || 'JEDDAH',
    state:          defState   || 'JEDDAH',
    postalCode:     defPostal  || '00000',
    country:        defCountry || 'Saudi Arabia'
  })).filter(i => i.name);
}

async function handleFile(file) {
  if (!file) return;
  bMsg.style.display = 'none';
  let rows = [];

  try {
    rows = await parseFileToRows(file);
  } catch (err) {
    showMessage(bMsg, 'err', err.message);
    return;
  }

  if (!rows || !rows.length) {
    showMessage(bMsg, 'err', 'Error No data found. Check your file format.');
    return;
  }

  const settings = await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);
  batchItems = processLoadedRows(rows, settings);

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
  queueList.textContent = '';
  for (let i = 0; i < batchItems.length; i++) {
    queueList.appendChild(renderEnhancedQueueItem(batchItems[i], i));
  }
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
      const creds = generateCredsFromCurrentPattern(item.name || '');
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

// ── Duplicate Guard: warn if any batch items were already registered ──────────
async function checkHistoryDuplicates(items) {
  const { history = [] } = await chrome.storage.local.get(['history']);
  if (!history.length) return true; // nothing to check

  const successfulKeys = new Set(
    history
      .filter(h => h.status === 'done')
      .map(h => {
        const name  = String(h.name  || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const email = String(h.email || '').trim().toLowerCase();
        return `${name}|${email}`;
      })
  );

  const dupes = items.filter(item => {
    const name  = String(item.name  || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const email = String(item.email || '').trim().toLowerCase();
    return successfulKeys.has(`${name}|${email}`);
  });

  if (!dupes.length) return true;

  const names = dupes.slice(0, 5).map(d => d.name).join(', ');
  const extra = dupes.length > 5 ? ` and ${dupes.length - 5} more` : '';
  return confirm(
    `⚠️ Duplicate Warning\n\n${dupes.length} item(s) in this batch were already registered successfully in your history:\n\n${names}${extra}\n\nContinue anyway?`
  );
}

bStart.addEventListener('click', async () => {
  if (!(await confirmReplaceRunning())) return;
  const stats = validateBatchItems(batchItems);
  renderValidation(batchValidation, batchValidationBody, batchValidationStatus, stats);
  if (stats.hasBlockingIssues) {
    showMessage(bMsg, 'err', 'Batch has missing or invalid emails. Fix the file first.');
    return;
  }
  // ── Duplicate guard ───────────────────────────────────────────────────────
  if (!(await checkHistoryDuplicates(batchItems))) return;

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
    batchLogs.textContent = '';
    return;
  }
  batchLogPanel.classList.add('show');
  batchLogs.textContent = '';
  const items = logs.slice(0, 50);
  for (const log of items) {
    const t = log.date ? new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const itemDiv = document.createElement('div');
    itemDiv.className = 'log-item';
    const timeDiv = document.createElement('div');
    timeDiv.className = 'log-time';
    timeDiv.textContent = t;
    itemDiv.appendChild(timeDiv);
    const textDiv = document.createElement('div');
    textDiv.className = 'log-text';
    textDiv.title = log.message || '';
    textDiv.textContent = log.message || '';
    itemDiv.appendChild(textDiv);
    batchLogs.appendChild(itemDiv);
  }
}

// -- Poll status ---
function updateStatusBanner(config) {
  const { show, bg, border, title, titleColor, progText, progColor } = config;
  const titleEl = document.getElementById('globalBatchTitle');
  if (batchBanner) {
    batchBanner.style.display = show ? 'flex' : 'none';
    if (show) {
      if (bg) batchBanner.style.background = bg;
      if (border) batchBanner.style.borderColor = border;
    }
  }
  if (titleEl && title) {
    titleEl.textContent = title;
    if (titleColor) titleEl.style.color = titleColor;
  }
  if (batchProgress && progText) {
    batchProgress.textContent = progText;
    if (progColor) batchProgress.style.color = progColor;
  }
}

function updateSingleModeUI(singleRunning) {
  if (singleRunning) {
    updateStatusBanner({
      show: true, bg: 'rgba(210,153,34,.1)', border: 'rgba(210,153,34,.3)',
      title: 'Single Registration Running...', titleColor: 'var(--green)',
      progText: 'Automating Prometric registration...', progColor: 'var(--yellow)'
    });
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

function updateBatchModeRunningUI(queueLength, queueIndex, queue) {
  const done    = (queue || []).filter(i => i.status === 'done').length;
  const failed  = (queue || []).filter(i => i.status === 'failed').length;
  const finished = done + failed;
  const pending  = queueLength - finished;

  // ── ETA ──────────────────────────────────────────────────────────────────
  let etaStr = '';
  const batchStartTime = window.__batchStartTime;
  if (batchStartTime && finished > 0) {
    const elapsedMs     = Date.now() - batchStartTime;
    const avgMsPerUser  = elapsedMs / finished;
    const remainingMs   = avgMsPerUser * pending;
    const remainingMins = Math.ceil(remainingMs / 60000);
    if (remainingMins <= 1)         etaStr = ' · ~1 min remaining';
    else if (remainingMins < 60)    etaStr = ` · ~${remainingMins} min remaining`;
    else {
      const h = Math.floor(remainingMins / 60);
      const m = remainingMins % 60;
      etaStr = ` · ~${h}h ${m}m remaining`;
    }
  }

  updateStatusBanner({
    show: true, bg: 'rgba(210,153,34,.1)', border: 'rgba(210,153,34,.3)',
    title: 'Batch Registration Running...', titleColor: 'var(--green)',
    progText: `${Math.min(queueIndex + 1, queueLength)} / ${queueLength}${etaStr}`, progColor: 'var(--yellow)'
  });
  if (bStart) bStart.style.display = 'none';
  if (resumeBatchBtn) resumeBatchBtn.style.display = 'none';
  if (pauseBatchBtn) pauseBatchBtn.style.display = 'block';
  if (cancelBatchBtn) cancelBatchBtn.style.display = 'block';
  if (batchSpinner) batchSpinner.style.display = 'block';
  if (retryFailedBtn) retryFailedBtn.style.display = 'none';
}


function updateBatchModePausedUI(queue, queueIndex, isRunning) {
  const pendingItems = queue.slice(queueIndex).filter(it => it.status === 'pending');
  const hasPending   = pendingItems.length > 0 && queueIndex < queue.length;

  if (bStart) bStart.style.display = 'none';
  if (pauseBatchBtn) pauseBatchBtn.style.display = 'none';
  if (batchSpinner) batchSpinner.style.display = 'none';

  if (hasPending) {
    updateStatusBanner({
      show: true, bg: 'rgba(56,139,253,.08)', border: 'rgba(56,139,253,.3)',
      title: 'Batch Paused', titleColor: 'var(--yellow)',
      progText: `Queue paused - ${pendingItems.length} remaining`, progColor: 'var(--blue)'
    });
    if (resumeBatchBtn) resumeBatchBtn.style.display = 'block';
    if (cancelBatchBtn) cancelBatchBtn.style.display = 'block';
  } else {
    updateStatusBanner({ show: false });
    if (resumeBatchBtn) resumeBatchBtn.style.display = 'none';
    if (cancelBatchBtn) cancelBatchBtn.style.display = 'none';
    if (bStart) bStart.style.display = 'block';
  }
  const failedCount = queue.filter(it => it.status === 'failed').length;
  if (retryFailedBtn) retryFailedBtn.style.display = failedCount > 0 && !isRunning ? 'block' : 'none';
}

function hasQueueChanged(queue, oldQueue) {
  if (queue.length !== oldQueue.length) return true;
  return queue.some((it, i) =>
    it.status !== oldQueue[i]?.status ||
    it.finalUsername !== oldQueue[i]?.finalUsername ||
    it.failureReason !== oldQueue[i]?.failureReason
  );
}

function handleEmptyQueue(singleRunning) {
  if (retryFailedBtn) retryFailedBtn.style.display = 'none';
  if (clearSessionBtn) clearSessionBtn.style.display = 'none';
  if (!singleRunning && batchBanner) batchBanner.style.display = 'none';
}

async function pollStatus() {
  const { queue, queueIndex, isRunning, singleRunning, runLogs = [] } = await chrome.storage.local.get(['queue', 'queueIndex', 'isRunning', 'singleRunning', 'runLogs']);
  renderLogs(runLogs);

  // Update header status pill
  if (isRunning)      updateStatusPill('running');
  else if (singleRunning) updateStatusPill('single');
  else                updateStatusPill('idle');

  updateSingleModeUI(singleRunning);

  if (!queue || queue.length === 0) {
    updateProgressAndStats(null);
    return handleEmptyQueue(singleRunning);
  }

  const queueChanged = queue.length === batchItems.length && hasQueueChanged(queue, batchItems);

  if (isRunning || singleRunning || batchItems.length === 0 || queueChanged) {
    batchItems = queue;
    renderQueue();
    queueWrap.style.display = 'block';
    bStart.disabled = true;
  }
  if (clearSessionBtn) clearSessionBtn.style.display = queue.length > 0 ? 'block' : 'none';

  // Update stats and progress bar
  if (queue.length > 0 && !singleRunning) {
    updateProgressAndStats(queue, queueIndex, isRunning);
    updateQueueItemsUI(queue, queueIndex, isRunning);

    if (isRunning) {
      // Track batch start time for ETA (reset when a fresh batch starts at index 0)
      if (!window.__batchStartTime || queueIndex === 0) {
        if (!window.__batchStartTime) window.__batchStartTime = Date.now();
      }
      updateBatchModeRunningUI(queue.length, queueIndex, queue);
    } else {
      window.__batchStartTime = null;
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

// -- HIST// History filter state
let historyFilter = 'all';
let historySearch = '';

// Format a date as a readable day label: "Saturday, 20 Jun 2026"
function formatDayLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

// Returns a sortable day key: "2026-06-20"
function dayKey(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

function exportDayCSV(dayRecords, dateLabel) {
  const rows = [
    ['Name', 'Email', 'Username', 'Password', 'Status', 'Reason', 'URL', 'Step', 'Date'],
    ...dayRecords.map(h => [
      h.name || '',
      h.email || '',
      h.finalUsername || h.username || '',
      h.password || '',
      h.status || '',
      h.reason || '',
      h.url || '',
      h.step || '',
      h.date ? new Date(h.date).toLocaleString() : ''
    ])
  ];
  const csvContent = rows.map(row =>
    row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `history_${dateLabel}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get(['history']);
  const list          = document.getElementById('histList');
  const countEl       = document.getElementById('histCount');
  const analyticsWrap = document.getElementById('histAnalytics');
  if (!list) return;

  // ── Today's summary + All-Time stats (always on full history) ────────────
  const today = new Date().toDateString();
  let todaySuccess = 0, todayFail = 0;
  let allSuccess = 0, allFail = 0;
  const allDayKeys = new Set();
  history.forEach(h => {
    if (h.status === 'done')        allSuccess++;
    else if (h.status === 'failed') allFail++;
    if (h.date) allDayKeys.add(dayKey(h.date));
    if (h.date && new Date(h.date).toDateString() === today) {
      if (h.status === 'done')        todaySuccess++;
      else if (h.status === 'failed') todayFail++;
    }
  });
  if (analyticsWrap) {
    analyticsWrap.style.display = history.length ? 'block' : 'none';
    const todayTotal = todaySuccess + todayFail;
    const todayRate  = todayTotal ? Math.round((todaySuccess / todayTotal) * 100) : 0;
    const allTotal   = allSuccess + allFail;
    const allRate    = allTotal   ? Math.round((allSuccess   / allTotal)   * 100) : 0;
    document.getElementById('statSuccess').textContent    = todaySuccess;
    document.getElementById('statFail').textContent       = todayFail;
    document.getElementById('statTodayRate').textContent  = `${todayRate}%`;
    document.getElementById('statAllSuccess').textContent = allSuccess;
    document.getElementById('statAllFail').textContent    = allFail;
    document.getElementById('statAllDays').textContent    = allDayKeys.size;
    document.getElementById('statAllRate').textContent    = `${allRate}%`;
  }

  // ── Apply filter + search ─────────────────────────────────────────────────
  const isSearching = !!historySearch;
  let filtered = history;
  if (historyFilter !== 'all') filtered = filtered.filter(h => h.status === historyFilter);
  if (isSearching) {
    const q = historySearch.toLowerCase();
    filtered = filtered.filter(h =>
      (h.name || '').toLowerCase().includes(q) ||
      (h.finalUsername || '').toLowerCase().includes(q) ||
      (h.email || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    countEl.textContent = '0 records';
    list.innerHTML = '<div class="hist-empty">No results found</div>';
    return;
  }

  // ── Group by calendar day ─────────────────────────────────────────────────
  const groups = new Map();
  const todayKey_ = dayKey(new Date().toISOString());

  filtered.forEach(h => {
    const dk    = h.date ? dayKey(h.date) : 'unknown';
    const label = h.date ? formatDayLabel(h.date) : 'Unknown Date';
    if (!groups.has(dk)) groups.set(dk, { dk, label, records: [], historyIndices: [] });
    const g = groups.get(dk);
    g.records.push(h);
    g.historyIndices.push(history.indexOf(h));
  });

  const sortedGroups = [...groups.values()].sort((a, b) => b.dk.localeCompare(a.dk));

  // ── Smart count: "24 records across 3 days" ───────────────────────────────
  const dayCount = sortedGroups.length;
  countEl.textContent = dayCount > 1
    ? `${filtered.length} records across ${dayCount} days`
    : `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

  // ── Render ────────────────────────────────────────────────────────────────
  list.innerHTML = '';

  sortedGroups.forEach(({ dk, label, records, historyIndices }) => {
    const isToday  = dk === todayKey_;
    // Auto-expand when searching so user sees results immediately
    const isOpen   = isToday || isSearching;
    const doneCount   = records.filter(r => r.status === 'done').length;
    const failedCount = records.filter(r => r.status === 'failed').length;

    const section = document.createElement('div');
    section.className = 'hist-day-section';

    // ── Day header ────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = `hist-day-header${isOpen ? ' open' : ''}`;
    header.dataset.dk = dk;
    header.innerHTML = `
      <span class="hist-day-chevron">▶</span>
      <span class="hist-day-label">
        ${escapeHtml(label)}
        ${isToday ? '<span class="hist-day-today">Today</span>' : ''}
      </span>
      <span class="hist-day-stats">
        ${doneCount   ? `<span class="hist-day-stat ok">✓ ${doneCount}</span>`   : ''}
        ${failedCount ? `<span class="hist-day-stat fail">✗ ${failedCount}</span>` : ''}
      </span>
      ${doneCount ? `<button class="hist-day-copy-all" data-dk="${escapeHtml(dk)}" title="Copy all credentials for this day">Copy All</button>` : ''}
      <button class="hist-day-export" data-dk="${escapeHtml(dk)}" title="Export this day as CSV">CSV</button>
      <button class="hist-day-clear" data-dk="${escapeHtml(dk)}" data-label="${escapeHtml(label)}" title="Delete this day from history">🗑</button>
    `;

    // ── Day body ──────────────────────────────────────────────────────────
    const body = document.createElement('div');
    body.className = `hist-day-body${isOpen ? '' : ' collapsed'}`;

    body.innerHTML = records.map((h, i) => {
      const realIdx = historyIndices[i];
      return `
        <div class="hist-item">
          <div class="hist-name" title="${escapeHtml(h.reason || h.name || '')}">${escapeHtml(h.name || '-')}</div>
          <div class="hist-user" title="${escapeHtml(h.finalUsername || '')}">${escapeHtml(h.finalUsername || '-')}</div>
          <div class="hist-pass" title="${escapeHtml(h.password || '')}">${escapeHtml(h.password || '-')}</div>
          <div style="text-align:right;white-space:nowrap">
            <span class="hist-badge ${escapeHtml(h.status)}" title="${escapeHtml(h.reason || (h.date ? new Date(h.date).toLocaleString('en-GB') : ''))}">${h.status === 'done' ? 'OK' : 'Fail'}</span>
            ${h.status === 'done' ? `<button class="hist-copy" data-index="${realIdx}" title="Copy Credentials">
              <svg class="pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>` : ''}
          </div>
        </div>`;
    }).join('');

    section.appendChild(header);
    section.appendChild(body);
    list.appendChild(section);
  });

  // ── Toggle collapse ───────────────────────────────────────────────────────
  list.querySelectorAll('.hist-day-header').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('.hist-day-export') ||
          e.target.closest('.hist-day-copy-all') ||
          e.target.closest('.hist-day-clear')) return;
      const body = hdr.nextElementSibling;
      const isOpen_ = hdr.classList.contains('open');
      hdr.classList.toggle('open', !isOpen_);
      body.classList.toggle('collapsed', isOpen_);
    });
  });

  // ── Per-day CSV export ────────────────────────────────────────────────────
  list.querySelectorAll('.hist-day-export').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const group = groups.get(btn.dataset.dk);
      if (group) exportDayCSV(group.records, btn.dataset.dk);
    });
  });

  // ── Copy All creds for a day ──────────────────────────────────────────────
  list.querySelectorAll('.hist-day-copy-all').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const group = groups.get(btn.dataset.dk);
      if (!group) return;
      const lines = group.records
        .filter(r => r.status === 'done' && (r.finalUsername || r.username))
        .map(r => `${r.finalUsername || r.username}\t${r.password || ''}`)
        .join('\n');
      if (!lines) return;
      fallbackCopyPopup(lines);
      const old = btn.textContent;
      btn.textContent = '✓ Copied!';
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'var(--green)';
      setTimeout(() => {
        btn.textContent = old;
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 2000);
    });
  });

  // ── Clear Day ─────────────────────────────────────────────────────────────
  list.querySelectorAll('.hist-day-clear').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const label_ = btn.dataset.label;
      if (!confirm(`Delete all history records for "${label_}"?`)) return;
      const dkToClear = btn.dataset.dk;
      const { history: latest = [] } = await chrome.storage.local.get(['history']);
      const updated = latest.filter(h => !h.date || dayKey(h.date) !== dkToClear);
      await chrome.storage.local.set({ history: updated });
      loadHistory();
    });
  });
}


// History search
document.getElementById('histSearch')?.addEventListener('input', e => {
  historySearch = e.target.value.trim();
  loadHistory();
});

// History filter tabs
document.querySelectorAll('.hist-filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.hist-filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    historyFilter = tab.dataset.filter;
    loadHistory();
  });
});

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
    const btn = e.target.closest('.hist-copy');
    if (btn) {
      const oldHtml = btn.innerHTML;
      btn.innerHTML = `<svg class="pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => btn.innerHTML = oldHtml, 2000);
    }
  }

  // Handle queue item cred copy
  if (e.target.closest('.q-cred-copy')) {
    const btn = e.target.closest('.q-cred-copy');
    const u = btn.dataset.user;
    const p = btn.dataset.pass;
    fallbackCopyPopup(`${u}\t${p}`);
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `<svg class="pointer-events-none" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => btn.innerHTML = oldHtml, 2000);
  }

  // Handle single mode preview copy
  if (e.target.closest('#sCopyUser')) {
    const btn = e.target.closest('#sCopyUser');
    fallbackCopyPopup(document.getElementById('sPreviewUser')?.textContent || '');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    setTimeout(() => btn.innerHTML = oldHtml, 2000);
  }
  if (e.target.closest('#sCopyPass')) {
    const btn = e.target.closest('#sCopyPass');
    fallbackCopyPopup(document.getElementById('sPreviewPass')?.textContent || '');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
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
const excludedSheetRows = new Set();

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
    const c = generateCredsFromCurrentPattern(item.name);
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

setInterval(checkClipboard, 1000);
checkClipboard();
loadSettings();

// -- Pattern Live Preview in Settings ---
document.getElementById('passPattern')?.addEventListener('input', (e) => {
  const p = e.target.value;
  const pEl = document.getElementById('patternPreview');
  if (!pEl) return;
  const c = generateCredentials('ABDULLAH MOHAMMED', p);
  if (c) {
    pEl.style.display = 'block';
    pEl.textContent = `Example: ${c.password}`;
  } else {
    pEl.style.display = 'none';
  }
});

// -- Quick Actions Bar ---
document.getElementById('quickCopyLast')?.addEventListener('click', async (e) => {
  const { history = [] } = await chrome.storage.local.get(['history']);
  const lastDone = history.find(h => h.status === 'done');
  if (lastDone && lastDone.finalUsername) {
    fallbackCopyPopup(`${lastDone.finalUsername}\t${lastDone.password}`);
    const btn = e.target.closest('button');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'rgba(63,185,80,0.4)';
    setTimeout(() => {
      btn.innerHTML = oldHtml;
      btn.style.color = '';
      btn.style.borderColor = '';
    }, 2000);
  } else {
    alert('No recent successful registrations found.');
  }
});

document.getElementById('quickOpenPrometric')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.prometric.com/test-takers/search' });
});

// -- Export for Testing ---
if (typeof module !== 'undefined' && module.exports) {
  if (typeof isValidEmail === 'undefined') {
    // Inject required utilities for Node test environment (so popup.test.js can use them via global or direct require)
    const utils = require('./utils.js');
    global.isValidEmail = utils.isValidEmail;
    global.generateCredentials = utils.generateCredentials;
    
    const parsers = require('./parsers.js');
    global.parseDelimitedRows = parsers.parseDelimitedRows;
    global.parseCSV = parsers.parseCSV;
  }
  module.exports = {
    generateCredsFromCurrentPattern,
    isValidEmail,
    validateBatchItems,
    parseDelimitedRows
  };
}
