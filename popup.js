// ── Init ──────────────────────────────────────────────────────────────────────
const { version } = chrome.runtime.getManifest();
const versionBadge = document.getElementById('versionBadge');
if (versionBadge) versionBadge.textContent = 'v' + version;

// ── Theme Toggle ──────────────────────────────────────────────────────────────
async function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    document.getElementById('themeToggle').textContent = '🌙';
  } else {
    document.body.classList.remove('light-mode');
    document.getElementById('themeToggle').textContent = '☀️';
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

// ── Copy helper: works even when popup is closing ─────────────────────────────
function fallbackCopyPopup(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(_) {}
  document.body.removeChild(ta);
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function genCreds(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;
  if (parts.length === 1) parts.push(parts[0]); // handle single word names
  const username = (parts[0] + parts[1]).toUpperCase();
  
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
  // Fill first name greedily up to 20 chars, ensuring at least 1 word is left for last name
  while (idx < parts.length - 1 && (firstName.length + 1 + parts[idx].length) <= 20) {
    firstName += ' ' + parts[idx];
    idx++;
  }
  
  let lastName = parts.slice(idx).join(' ');
  
  // Enforce the hard 20-character limit just in case
  if (firstName.length > 20) firstName = firstName.substring(0, 20).trim();
  if (lastName.length > 20) lastName = lastName.substring(0, 20).trim();

  return { username, password, firstName, lastName };
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('pane-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────
const SETTINGS_KEYS = ['pageDelay', 'userDelay', 'autoSubmit', 'defAddress', 'defCity', 'defState', 'defPostal', 'defCountry', 'defAnswer', 'passPattern', 'sheetUrl'];

async function loadSettings() {
  const settings = await chrome.storage.local.get(SETTINGS_KEYS);
  if (settings.pageDelay) document.getElementById('pageDelay').value = settings.pageDelay;
  if (settings.userDelay) document.getElementById('userDelay').value = settings.userDelay;
  if (settings.autoSubmit !== undefined) document.getElementById('autoSubmit').checked = settings.autoSubmit;
  if (settings.defAddress) document.getElementById('defAddress').value = settings.defAddress;
  if (settings.defCity) document.getElementById('defCity').value = settings.defCity;
  if (settings.defState) document.getElementById('defState').value = settings.defState;
  if (settings.defPostal) document.getElementById('defPostal').value = settings.defPostal;
  if (settings.defCountry) document.getElementById('defCountry').value = settings.defCountry;
  if (settings.defAnswer) document.getElementById('defAnswer').value = settings.defAnswer;
  if (settings.passPattern) document.getElementById('passPattern').value = settings.passPattern;
  if (settings.sheetUrl) document.getElementById('sheetUrl').value = settings.sheetUrl;
}

// ── Settings Actions ──────────────────────────────────────────────────────────
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
  btn.textContent = '✅ Saved!';
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
  const defaults = {
    pageDelay: 1,
    userDelay: 2,
    autoSubmit: false,
    defAddress: 'Al-Alameya',
    defCity: 'JEDDAH',
    defState: 'JEDDAH',
    defPostal: '00000',
    defCountry: 'Saudi Arabia',
    defAnswer: 'a',
    passPattern: '{F}@{f}#$1970'
  };
  await chrome.storage.local.set(defaults);
  await loadSettings();
  updateSinglePreview();
  alert('Settings reset to defaults.');
});

document.getElementById('clearAllData')?.addEventListener('click', async () => {
  if (!confirm('⚠️ Are you sure? This will delete History and Active Queues, but KEEP your Settings.')) return;
  const toClear = ['history', 'queue', 'queueIndex', 'currentItem', 'isRunning', 'singleRunning', 'savedCreds'];
  await chrome.storage.local.remove(toClear);
  location.reload();
});

// ── SINGLE MODE ───────────────────────────────────────────────────────────────
const sName        = document.getElementById('sName');
const sEmail       = document.getElementById('sEmail');
const sStart       = document.getElementById('sStart');
const sMsg         = document.getElementById('sMsg');
const singleBanner = document.getElementById('singleBanner');
const stopSingle   = document.getElementById('stopSingle'); // ← explicit ref (used in pollStatus)

const scNamePanel = document.getElementById('scName');
const scUserPanel = document.getElementById('scUser');
const scPassPanel = document.getElementById('scPass');
const savedCredsPanel = document.getElementById('savedCredsPanel');

function updateSinglePreview() {
  const c = genCreds(sName.value);
  const emailOk = sEmail.value.trim().length > 0;
  if (c && emailOk) {
    scNamePanel.textContent = sName.value.trim();
    scUserPanel.textContent = c.username;
    scPassPanel.textContent = c.password;
    savedCredsPanel.style.display = 'block';
    sStart.disabled = false;
  } else {
    // Re-run loadSavedCreds to show last real credentials if single input is cleared
    loadSavedCreds();
    sStart.disabled = true;
  }
}
sName.addEventListener('input', updateSinglePreview);
sEmail.addEventListener('input', updateSinglePreview);

sStart.addEventListener('click', async () => {
  const c = genCreds(sName.value);
  if (!c) return;
  await chrome.storage.local.set({
    savedCreds: { username: c.username, password: c.password, name: sName.value.trim() }
  });
  const { defAddress, defCity, defState, defPostal, defCountry } = await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);
  
  await chrome.runtime.sendMessage({
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
  sMsg.textContent = '✅ Opened! Filling in progress…';
  sMsg.style.display = 'block';
  singleBanner.classList.add('show');
  
  sStart.style.display = 'none';
});

document.getElementById('stopSingle').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'stopQueue' });
  singleBanner.classList.remove('show');
  
  sStart.style.display = 'block';
  
  sMsg.className = 'msg err';
  sMsg.textContent = '⏹ Registration stopped by user.';
  sMsg.style.display = 'block';
});

// ── BATCH MODE — CSV/Excel parser ─────────────────────────────────────────────
let batchItems = [];

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  let start = 0;
  const first = lines[0].toLowerCase();
  if (first.includes('name') || first.includes('email')) start = 1;

  return lines.slice(start).map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  }).filter(c => c.length >= 2 && c[0].trim());
}

async function parseXLSX(buffer) {
  try {
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
          } catch (e) { /* skip */ }
        }
        pos = dataStart + compSize;
      } else pos++;
    }

    const shared = [];
    if (entries['xl/sharedStrings.xml']) {
      const matches = entries['xl/sharedStrings.xml'].matchAll(/<t[^>]*>([^<]*)<\/t>/g);
      for (const m of matches) shared.push(m[1]);
    }

    const sheetXML  = entries['xl/worksheets/sheet1.xml'] || '';
    const rows      = [];
    const rowMatches = sheetXML.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g);
    for (const rm of rowMatches) {
      const cells = [];
      const cellMatches = rm[1].matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*(?:t="([^"]*)")?[^>]*>[\s\S]*?<v>(\d+(?:\.\d+)?)<\/v>[\s\S]*?<\/c>/g);
      for (const cm of cellMatches) {
        const type = cm[2], val = cm[3];
        cells.push(type === 's' ? (shared[parseInt(val)] || '') : val);
      }
      if (cells.length > 0) rows.push(cells);
    }

    let start = 0;
    if (rows[0] && (rows[0][0].toLowerCase().includes('name') || rows[0][1]?.toLowerCase().includes('email'))) start = 1;
    return rows.slice(start).filter(r => r[0]);
  } catch (e) {
    return [];
  }
}

const fileInput     = document.getElementById('fileInput');
const uploadArea    = document.getElementById('uploadArea');
const queueWrap     = document.getElementById('queueWrap');
const queueList     = document.getElementById('queueList');
const qCount        = document.getElementById('qCount');
const bStart        = document.getElementById('bStart');
const stopBatch     = document.getElementById('stopBatch');
const resumeBtn     = document.getElementById('resumeBatch');
const bMsg          = document.getElementById('bMsg');
const batchBanner   = document.getElementById('batchBanner');
const batchSpinner  = document.getElementById('batchSpinner');
const batchProgress = document.getElementById('batchProgress');

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
  } else if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
    // Note: parseXLSX handles the OOXML (.xlsx) ZIP/DEFLATE format.
    // Legacy .xls (BIFF binary) is NOT supported — user will get an empty result.
    if (fname.endsWith('.xls') && !fname.endsWith('.xlsx')) {
      bMsg.className = 'msg err';
      bMsg.textContent = '❌ Legacy .xls format is not supported. Please save your file as .xlsx or .csv and try again.';
      bMsg.style.display = 'block';
      return;
    }
    const buf = await file.arrayBuffer();
    rows = await parseXLSX(buf);
  } else {
    bMsg.className = 'msg err';
    bMsg.textContent = '❌ Unsupported file type. Use .csv, .xlsx or .xls';
    bMsg.style.display = 'block';
    return;
  }

  if (!rows.length) {
    bMsg.className = 'msg err';
    bMsg.textContent = '❌ No data found. Check your file format.';
    bMsg.style.display = 'block';
    return;
  }

  batchItems = rows.map(r => ({
    name:           (r[0] || '').trim(),
    email:          (r[1] || '').trim(),
    status:         'pending',
    mailingAddress: 'Al-Alameya',
    city:           'JEDDAH',
    state:          'JEDDAH',
    postalCode:     '00000',
    country:        'Saudi Arabia'
  })).filter(i => i.name && i.email);

  renderQueue();
  queueWrap.style.display = 'block';
  bStart.disabled = batchItems.length === 0;
  
  // Show Start button, hide others
  bStart.style.display = 'block';
  stopBatch.style.display = 'none';
  resumeBtn.style.display = 'none';
  batchBanner.classList.remove('show');
}

function renderQueue() {
  qCount.textContent = `${batchItems.length} people`;
  queueList.innerHTML = batchItems.map((item, i) => `
    <div class="queue-item" id="qi-${i}">
      <div class="q-dot ${item.status}" id="qd-${i}"></div>
      <div style="flex:1;min-width:0">
        <div class="q-name">${item.name}</div>
        <div class="q-email">${item.email}</div>
      </div>
      <div class="q-status ${item.status}" id="qs-${i}">${statusLabel(item.status)}</div>
    </div>`).join('');
}

function statusLabel(s) {
  return { pending: 'Waiting', running: '▶ Running', done: '✓ Done', failed: '✗ Failed' }[s] || s;
}

document.getElementById('clearQueue').addEventListener('click', () => {
  batchItems = [];
  queueWrap.style.display = 'none';
  bStart.disabled = true;
  fileInput.value = '';
  
  bStart.style.display = 'block';
  stopBatch.style.display = 'none';
  resumeBtn.style.display = 'none';
  batchBanner.classList.remove('show');
  bMsg.style.display = 'none';
});

bStart.addEventListener('click', async () => {
  const { defAddress, defCity, defState, defPostal, defCountry } = await chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry']);
  const items = batchItems.map(i => ({
    ...i,
    mailingAddress: defAddress || 'Al-Alameya',
    city:           defCity    || 'JEDDAH',
    state:          defState   || 'JEDDAH',
    postalCode:     defPostal  || '00000',
    country:        defCountry || 'Saudi Arabia'
  }));
  userStopped = false;
  await chrome.runtime.sendMessage({ action: 'startQueue', items });
  batchBanner.classList.add('show');
  
  bStart.style.display = 'none';
  resumeBtn.style.display = 'none';
  stopBatch.style.display = 'block';
  batchSpinner.style.display = 'block';
  
  bMsg.className = 'msg ok';
  bMsg.textContent = `✅ Started ${batchItems.length} registrations!`;
  bMsg.style.display = 'block';
});

stopBatch.addEventListener('click', async () => {
  userStopped = true;
  await chrome.runtime.sendMessage({ action: 'stopQueue' });
  
  stopBatch.style.display = 'none';
  batchSpinner.style.display = 'none';
  
  bMsg.className = 'msg err';
  bMsg.textContent = '⏹ Execution stopped by user.';
  bMsg.style.display = 'block';
});

if (resumeBtn) {
  resumeBtn.addEventListener('click', async () => {
    userStopped = false;
    await chrome.runtime.sendMessage({ action: 'resumeQueue' });
    
    bStart.style.display = 'none';
    resumeBtn.style.display = 'none';
    stopBatch.style.display = 'block';
    batchSpinner.style.display = 'block';
    
    bMsg.className = 'msg ok';
    bMsg.textContent = '▶ Resuming batch registration…';
    bMsg.style.display = 'block';
  });
}

// ── Poll status ───────────────────────────────────────────────────────────────
let userStopped = false;

async function pollStatus() {
  const { queue, queueIndex, isRunning, singleRunning } = await chrome.storage.local.get(['queue', 'queueIndex', 'isRunning', 'singleRunning']);
  
  // Single Mode UI updates
  if (singleRunning) {
    singleBanner.classList.add('show');
    sStart.style.display = 'none';
    stopSingle.style.display = 'block';
  } else {
    singleBanner.classList.remove('show');
    sStart.style.display = 'block';
    stopSingle.style.display = 'none';
  }

  // Batch Mode UI updates
  if (!queue || queue.length === 0) return;

  if (batchItems.length === 0 && queue.length > 0) {
    batchItems = queue;
    renderQueue();
    queueWrap.style.display = 'block';
    bStart.disabled = true;
  }

  if (queue.length > 0) {
    queue.forEach((item, i) => {
      const dot  = document.getElementById(`qd-${i}`);
      const stat = document.getElementById(`qs-${i}`);
      if (!dot || !stat) return;
      const s = i < queueIndex       ? (item.status || 'done')
              : i === queueIndex && isRunning ? 'running'
              : 'pending';
      dot.className  = `q-dot ${s}`;
      stat.className = `q-status ${s}`;
      stat.textContent = statusLabel(s);
    });

    if (isRunning && queue.length > 1) { // >1 means it's batch mode
      batchBanner.classList.add('show');
      batchBanner.style.background = 'rgba(210,153,34,.1)';
      batchBanner.style.borderColor = 'rgba(210,153,34,.3)';
      batchProgress.style.color = 'var(--yellow)';
      batchProgress.textContent = `Processing ${Math.min(queueIndex + 1, queue.length)} of ${queue.length}…`;
      
      bStart.style.display = 'none';
      resumeBtn.style.display = 'none';
      stopBatch.style.display = 'block';
      batchSpinner.style.display = 'block';
      userStopped = false;
    } else if (queue.length > 1) { // Stopped batch mode
      const pendingItems = queue.slice(queueIndex).filter(it => it.status === 'pending');
      const hasPending   = pendingItems.length > 0 && queueIndex < queue.length;
      
      bStart.style.display = 'none';
      stopBatch.style.display = 'none';
      batchSpinner.style.display = 'none';
      
      if (hasPending) {
        batchBanner.classList.add('show');
        batchBanner.style.background = 'rgba(56,139,253,.08)';
        batchBanner.style.borderColor = 'rgba(56,139,253,.3)';
        batchProgress.style.color = 'var(--blue)';
        batchProgress.textContent = `⏸ Queue paused — ${pendingItems.length} remaining`;
        resumeBtn.style.display = 'block';
      } else {
        batchBanner.classList.remove('show');
        resumeBtn.style.display = 'none';
        bStart.style.display = 'block';
      }
    }
  }
}

setInterval(pollStatus, 1500);
pollStatus();

// ── HISTORY TAB ───────────────────────────────────────────────────────────────
async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get(['history']);
  const list    = document.getElementById('histList');
  const countEl = document.getElementById('histCount');
  if (!list) return;

  countEl.textContent = `${history.length} record${history.length !== 1 ? 's' : ''}`;

  if (history.length === 0) {
    list.innerHTML = '<div class="hist-empty">No registrations yet</div>';
    return;
  }

  list.innerHTML = history.map((h, i) => `
    <div class="hist-item">
      <div class="hist-name" title="${h.name || ''}">${h.name || '—'}</div>
      <div class="hist-user" title="${h.finalUsername || ''}">${h.finalUsername || '—'}</div>
      <div class="hist-pass" title="${h.password || ''}">${h.password || '—'}</div>
      <div style="text-align:right;white-space:nowrap">
        <span class="hist-badge ${h.status}" title="${h.date ? new Date(h.date).toLocaleString('en-GB') : ''}">${h.status === 'done' ? '✓' : '✗'}</span>
        ${h.status === 'done' ? `<button class="hist-copy" data-index="${i}">Copy</button>` : ''}
      </div>
    </div>`).join('');
}

document.getElementById('exportCSV')?.addEventListener('click', async () => {
  const { history = [] } = await chrome.storage.local.get(['history']);
  if (!history.length) return;
  const rows = [['Name', 'Username', 'Password', 'Email', 'Status', 'Date']];
  history.forEach(h => rows.push([h.name || '', h.finalUsername || '', h.password || '', h.email || '', h.status || '', h.date ? new Date(h.date).toLocaleString() : '']));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  
  chrome.downloads.download({
    url: 'data:text/csv;base64,' + btoa(unescape(encodeURIComponent(csv))),
    filename: `prometric_history_${new Date().toISOString().slice(0, 10)}.csv`,
    saveAs: false
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

setInterval(async () => {
  const histPane = document.getElementById('pane-history');
  if (histPane?.classList.contains('active')) loadHistory();
}, 3000);

loadHistory();

// ── Saved Credentials Panel ───────────────────────────────────────────────────
async function loadSavedCreds() {
  const { savedCreds, isRunning, singleRunning } = await chrome.storage.local.get(['savedCreds', 'isRunning', 'singleRunning']);
  // Don't overwrite the live preview if user is typing in single mode (unless it's actively running)
  if (!singleRunning && document.getElementById('pane-single')?.classList.contains('active') && sName.value.trim().length > 0) return;

  if (savedCreds && savedCreds.username) {
    if (scNamePanel) scNamePanel.textContent = savedCreds.name     || '';
    if (scUserPanel) scUserPanel.textContent = savedCreds.username || '';
    if (scPassPanel) scPassPanel.textContent = savedCreds.password || '';
    if (savedCredsPanel) savedCredsPanel.style.display = 'block';
  } else {
    if (savedCredsPanel) savedCredsPanel.style.display = 'none';
  }
}

// ── Global Event Delegation ────────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  // Handle history copy
  if (e.target.classList.contains('hist-copy')) {
    const i = e.target.getAttribute('data-index');
    const { history = [] } = await chrome.storage.local.get(['history']);
    const h = history[i];
    if (h) fallbackCopyPopup(`${h.finalUsername}\t${h.password}`);
    const btn = e.target;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = 'Copy', 5000);
  }
  
  // Handle saved creds copy
  if (e.target.classList.contains('sc-copy')) {
    const id = e.target.getAttribute('data-copy');
    const text = document.getElementById(id)?.textContent || '';
    fallbackCopyPopup(text);
    const btn = e.target;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = 'Copy', 5000);
  }
});

loadSavedCreds();
setInterval(loadSavedCreds, 3000);

// ── History Export ────────────────────────────────────────────────────────────
document.getElementById('exportCSV')?.addEventListener('click', async () => {
  const btn = document.getElementById('exportCSV');
  const { history = [] } = await chrome.storage.local.get(['history']);
  if (!history.length) return;

  const oldText = btn.textContent;
  btn.textContent = '⏳ Generating...';
  btn.disabled = true;

  try {
    // History is unshifted (newest first), so reverse it to keep original registration order
    const exportData = [...history].reverse();
    const header = 'Name,Email,Username,Password,Status\n';
    const csvContent = exportData.map(h => {
      const n = (h.name || '').replace(/"/g, '""');
      const e = (h.email || '').replace(/"/g, '""');
      return `"${n}","${e}","${h.finalUsername || h.username || ''}","${h.password || ''}","${h.status || ''}"`;
    }).join('\n');

    // Use BOM for UTF-8 to ensure Excel opens it correctly with any language
    const blob = new Blob(['\uFEFF' + header + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prometric_batch_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (e) {
    console.error('Export failed:', e);
    alert('Export failed. Check console for details.');
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
});

// ── Template Download ─────────────────────────────────────────────────────────
document.getElementById('downloadTemplate')?.addEventListener('click', () => {
  const csv  = 'Name,Email\nJOHN SMITH,john.smith@example.com\nSARAH JONES,sarah.jones@example.com';
  chrome.downloads.download({
    url: 'data:text/csv;base64,' + btoa(csv),
    filename: 'prometric_template.csv',
    saveAs: false
  });
});

// ── Google Sheet Integration ──────────────────────────────────────────────────
let sheetData = [];
let excludedSheetRows = new Set();

function parseCSVLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

function showSheetError(msg) {
  const el = document.getElementById('sheetMsg');
  if(el) {
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }
}

document.getElementById('sheetFetch')?.addEventListener('click', async () => {
  const btn = document.getElementById('sheetFetch');
  const url = document.getElementById('sheetUrl').value.trim();
  await chrome.storage.local.set({ sheetUrl: url });
  
  const m = url.match(/\/d\/(.*?)\//);
  if (!m) return showSheetError('Invalid Google Sheet URL. Make sure you copy the full link.');
  const id = m[1];
  
  let gid = '0';
  const gm = url.match(/[#&]gid=([0-9]+)/);
  if (gm) gid = gm[1];

  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  
  btn.textContent = '⏳';
  btn.disabled = true;
  showSheetError('');
  
  try {
    const res = await fetch(exportUrl);
    if (!res.ok) throw new Error('Cannot read sheet. Ensure share settings are "Anyone with the link can view".');
    
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('Sheet is empty or has only one row.');

    excludedSheetRows.clear();

    const headers = parseCSVLine(lines[0]);
    sheetData = lines.slice(1).map(parseCSVLine);

    const nameSel = document.getElementById('sheetNameCol');
    const emailSel = document.getElementById('sheetEmailCol');
    if (nameSel) nameSel.innerHTML = '';
    if (emailSel) emailSel.innerHTML = '';

    const daySel = document.getElementById('sheetDayCol');
    if (daySel) daySel.innerHTML = '<option value="-1">— No filter —</option>';

    headers.forEach((h, i) => {
      const opt = `<option value="${i}">${h || 'Unnamed Column'}</option>`;
      nameSel.innerHTML += opt;
      emailSel.innerHTML += opt;
      if (daySel) daySel.innerHTML += opt;
    });

    const hl = headers.map(h => (h||'').toLowerCase());
    const nIdx = hl.findIndex(h => h.includes('اسم') || h.includes('name') || h.includes('هوية'));
    const eIdx = hl.findIndex(h => h.includes('email') || h.includes('بريد'));
    const dIdx = hl.findIndex(h => h.includes('day') || h.includes('يوم'));
    
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
  document.getElementById('sheetStart').disabled = false;
  count.textContent = `${items.length} Names Found`;

  // Limit preview to 100 items to avoid lagging the popup
  const previewItems = items.slice(0, 100);
  list.innerHTML = previewItems.map((item, i) => {
    const c = genCreds(item.name);
    return `
    <div class="sheet-grid" style="padding:6px 12px;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.name}">${item.name}</div>
      <div style="font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.email}">${item.email}</div>
      <div style="font-family:monospace;color:var(--blue);font-size:11px">${c ? c.username : ''}</div>
      <div style="font-family:monospace;color:var(--yellow);font-size:11px">${c ? c.password : ''}</div>
      <div style="text-align:right">
        <button class="delete-row-btn" data-idx="${item.origIndex}" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:13px;font-weight:bold;padding:0 5px" title="Exclude from batch">✕</button>
      </div>
    </div>`;
  }).join('') + (items.length > 100 ? `<div style="text-align:center;padding:8px;color:var(--muted);font-size:11px">...and ${items.length - 100} more</div>` : '');

  list.querySelectorAll('.delete-row-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      excludedSheetRows.add(idx);
      renderSheetPreview();
    });
  });
}

document.getElementById('sheetNameCol')?.addEventListener('change', renderSheetPreview);
document.getElementById('sheetEmailCol')?.addEventListener('change', renderSheetPreview);

document.getElementById('sheetStart')?.addEventListener('click', async () => {
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

  await chrome.runtime.sendMessage({ action: 'startQueue', items });
  window.close();
});

// Build day filter checkboxes from selected column
function buildDayFilter(dIdx) {
  const filterWrap  = document.getElementById('sheetDayFilter');
  const badgesWrap  = document.getElementById('sheetDayBadges');
  if (!filterWrap || !badgesWrap) return;
  
  if (dIdx < 0) { filterWrap.style.display = 'none'; renderSheetPreview(); return; }

  const days = [...new Set(sheetData.map(r => (r[dIdx] || '').trim()).filter(Boolean))];
  if (days.length === 0) { filterWrap.style.display = 'none'; renderSheetPreview(); return; }

  badgesWrap.innerHTML = days.map(day => `
    <button class="day-badge selected" data-day="${day}"
      style="padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;
             background:rgba(56,139,253,.2);color:var(--blue);border:1px solid rgba(56,139,253,.4);
             transition:.15s">
      ${day}
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

// ── Clipboard Banner — shows last copied creds for 30 seconds ─────────────────
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
  const pct = remaining / 30000; // 0→1
  const circumference = 72; // 2πr ≈ 72 for r=11.5
  if (circle) circle.style.strokeDashoffset = circumference * (1 - pct);

  const secs = Math.ceil(remaining / 1000);
  if (textEl) textEl.textContent = `📋 ${copiedCreds.label || 'Credentials copied'} (${secs}s)`;

  // Copy Again button
  if (copyBtn && !copyBtn._bound) {
    copyBtn._bound = true;
    copyBtn.addEventListener('click', () => {
      fallbackCopyPopup(copiedCreds.text);
      copyBtn.textContent = '✓ Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy Again', 3000);
    });
  }
}

// ── Batch Status Banner — shows global progress when running ──────────────────
async function checkBatchStatus() {
  const { isRunning, queue, queueIndex } = await chrome.storage.local.get(['isRunning', 'queue', 'queueIndex']);
  const banner = document.getElementById('globalBatchBanner');
  const progText = document.getElementById('globalBatchProgress');
  
  if (!banner || !progText) return;

  if (isRunning && queue && queue.length > 0) {
    banner.style.display = 'flex';
    progText.textContent = `${queueIndex} / ${queue.length} completed`;
  } else {
    banner.style.display = 'none';
  }
}

document.getElementById('globalStopBatch')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopQueue' });
});

// Poll every second
setInterval(checkClipboard, 1000);
setInterval(checkBatchStatus, 1000);
checkClipboard();
checkBatchStatus();
loadSettings();
