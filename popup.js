// popup.js — V4.0 Pro Edition

// ── Init & State ─────────────────────────────────────────────────────────────
const { version } = chrome.runtime.getManifest();
const versionBadge = document.getElementById('versionBadge');
if (versionBadge) versionBadge.textContent = 'v' + version;

let currentLang = 'en';
let allSheetData = []; // Cached full sheet data
let sheetColumns = []; // Cached column names

// ── Language Toggle ───────────────────────────────────────────────────────────
const langToggle = document.getElementById('langToggle');
async function setLang(lang) {
  currentLang = lang;
  if (lang === 'ar') {
    document.body.classList.add('rtl');
    document.getElementById('langAR').classList.add('active');
    document.getElementById('langEN').classList.remove('active');
  } else {
    document.body.classList.remove('rtl');
    document.getElementById('langEN').classList.add('active');
    document.getElementById('langAR').classList.remove('active');
  }
  await chrome.storage.local.set({ lang });
}

langToggle?.addEventListener('click', async () => {
  await setLang(currentLang === 'en' ? 'ar' : 'en');
});

// ── Translations ─────────────────────────────────────────────────────────────
const T = {
  en: {
    dupWarning: "Warning: Some names are already in History or duplicated in this list.",
    emptyWarning: "Error: Please fill all names and emails before starting.",
    batchComplete: "Batch Complete!",
    notifTitle: "Batch Complete ✅",
    notifBody: (count) => `Finished registering ${count} users.`,
    errorTitle: "Error ❌",
    confirmReset: "Are you sure? This will delete History and Active Queues, but KEEP your Settings.",
    confirmDefault: "Reset all settings to defaults?",
    copyFinish: "📋 Copy & Finish",
    itemsFound: (n) => `${n} Names Found`,
    fetchSuccess: "Sheet fetched successfully!",
    fetchError: "Failed to fetch sheet. Check URL or Sharing settings."
  },
  ar: {
    dupWarning: "تنبيه: بعض الأسماء موجودة بالفعل في السجل أو مكررة في هذه القائمة.",
    emptyWarning: "خطأ: يرجى التأكد من تعبئة جميع الأسماء والإيميلات قبل البدء.",
    batchComplete: "تم الانتهاء من المجموعة!",
    notifTitle: "تم الانتهاء ✅",
    notifBody: (count) => `تم تسجيل ${count} مستخدم بنجاح.`,
    errorTitle: "خطأ ❌",
    confirmReset: "هل أنت متأكد؟ سيتم حذف السجل والقوائم النشطة، ولكن سيتم الاحتفاظ بالإعدادات.",
    confirmDefault: "إعادة جميع الإعدادات للوضع الافتراضي؟",
    copyFinish: "📋 نسخ وإنهاء",
    itemsFound: (n) => `تم العثور على ${n} اسم`,
    fetchSuccess: "تم سحب البيانات بنجاح!",
    fetchError: "فشل سحب البيانات. تأكد من الرابط أو إعدادات المشاركة."
  }
};

function getTxt(key, arg) {
  const val = T[currentLang][key];
  return typeof val === 'function' ? val(arg) : val;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fallbackCopyPopup(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(_) {}
  document.body.removeChild(ta);
}

function genCreds(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;
  if (parts.length === 1) parts.push(parts[0]);
  const username = (parts[0] + parts[1]).toUpperCase();
  const pattern = document.getElementById('passPattern').value || '{F}@{f}#$1970';
  const F = parts[0][0].toUpperCase();
  const f = F.toLowerCase();
  const L = parts[parts.length-1][0].toUpperCase();
  const l = L.toLowerCase();
  const password = pattern.replace(/{F}/g, F).replace(/{f}/g, f).replace(/{L}/g, L).replace(/{l}/g, l);
  return { username, password };
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const paneId = 'pane-' + tab.dataset.tab;
    const pane = document.getElementById(paneId);
    if (pane) pane.classList.add('active');
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────
const SETTINGS_KEYS = ['pageDelay', 'userDelay', 'autoSubmit', 'defAddress', 'defCity', 'defState', 'defPostal', 'defCountry', 'defAnswer', 'passPattern', 'sheetUrl', 'lang'];

async function loadSettings() {
  const s = await chrome.storage.local.get(SETTINGS_KEYS);
  if (s.pageDelay) document.getElementById('pageDelay').value = s.pageDelay;
  if (s.userDelay) document.getElementById('userDelay').value = s.userDelay;
  if (s.autoSubmit !== undefined) document.getElementById('autoSubmit').checked = s.autoSubmit;
  if (s.defAddress) document.getElementById('defAddress').value = s.defAddress;
  if (s.defCity) document.getElementById('defCity').value = s.defCity;
  if (s.defState) document.getElementById('defState').value = s.defState;
  if (s.defPostal) document.getElementById('defPostal').value = s.defPostal;
  if (s.defCountry) document.getElementById('defCountry').value = s.defCountry;
  if (s.defAnswer) document.getElementById('defAnswer').value = s.defAnswer;
  if (s.passPattern) document.getElementById('passPattern').value = s.passPattern;
  if (s.sheetUrl) document.getElementById('sheetUrl').value = s.sheetUrl;
  if (s.lang) await setLang(s.lang);
}

document.getElementById('saveSettings')?.addEventListener('click', async () => {
  const data = {};
  SETTINGS_KEYS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    data[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  await chrome.storage.local.set(data);
  const btn = document.getElementById('saveSettings');
  const old = btn.innerHTML;
  btn.innerHTML = '✅ Saved';
  setTimeout(() => btn.innerHTML = old, 1500);
});

document.getElementById('resetSettings')?.addEventListener('click', async () => {
  if (!confirm(getTxt('confirmDefault'))) return;
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
});

document.getElementById('clearAllData')?.addEventListener('click', async () => {
  if (!confirm(getTxt('confirmReset'))) return;
  await chrome.storage.local.remove(['history', 'queue', 'queueIndex', 'currentItem', 'isRunning', 'singleRunning', 'copiedCreds']);
  location.reload();
});

// ── Validation & Duplicates ──────────────────────────────────────────────────
async function validateQueue(items) {
  const { history = [] } = await chrome.storage.local.get(['history']);
  const histNames = new Set(history.map(h => (h.name || '').toLowerCase().trim()));
  const seenInQueue = new Set();
  
  let hasDup = false;
  let hasEmpty = false;

  for (const item of items) {
    const name = (item.name || '').toLowerCase().trim();
    if (!name || !(item.email || '').includes('@')) hasEmpty = true;
    if (histNames.has(name) || seenInQueue.has(name)) hasDup = true;
    seenInQueue.add(name);
  }

  if (hasEmpty) { alert(getTxt('emptyWarning')); return false; }
  if (hasDup) {
    if (!confirm(getTxt('dupWarning') + '\n\nDo you want to continue anyway?')) return false;
  }
  return true;
}

// ── Single Mode ───────────────────────────────────────────────────────────────
const sName = document.getElementById('sName');
const sEmail = document.getElementById('sEmail');
const sStart = document.getElementById('sStart');

function updateSinglePreview() {
  const name = sName.value.trim();
  const email = sEmail.value.trim();
  const card = document.getElementById('sPreviewCard');
  if (name.length > 2 && email.includes('@')) {
    sStart.disabled = false;
    card.style.display = 'block';
    const creds = genCreds(name);
    document.getElementById('sPrevUser').textContent = creds.username;
    document.getElementById('sPrevPass').textContent = creds.password;
  } else {
    sStart.disabled = true;
    card.style.display = 'none';
  }
}
sName?.addEventListener('input', updateSinglePreview);
sEmail?.addEventListener('input', updateSinglePreview);

sStart?.addEventListener('click', async () => {
  const items = [{ name: sName.value, email: sEmail.value, status: 'pending' }];
  if (!await validateQueue(items)) return;
  await chrome.storage.local.set({ queue: items, queueIndex: 0, isRunning: true });
  chrome.runtime.sendMessage({ action: 'resumeQueue' });
});

// ── Batch Upload ─────────────────────────────────────────────────────────────
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

uploadArea?.addEventListener('click', () => fileInput.click());

fileInput?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const content = ev.target.result;
    let items = [];
    
    if (file.name.endsWith('.csv')) {
      const rows = content.split('\n').map(r => r.split(',')).filter(r => r.length >= 2);
      items = rows.slice(1).map(r => ({ name: r[0].trim(), email: r[1].trim(), status: 'pending' }));
    } else {
      // Excel handling (requires library which we assume is in the head via script tag if possible, or we use simpler parsing)
      // For now, let's assume CSV or simpler text for the demo, but keep the UI hooks.
    }
    
    if (items.length > 0) {
      document.getElementById('queueWrap').style.display = 'block';
      document.getElementById('qCount').textContent = items.length;
      document.getElementById('bStart').disabled = false;
      await chrome.storage.local.set({ queue: items, queueIndex: 0 });
      renderQueue(items);
    }
  };
  reader.readAsText(file);
});

function renderQueue(items) {
  const list = document.getElementById('queueList');
  if (!list) return;
  list.innerHTML = items.map(item => `
    <div class="list-item">
      <div>
        <div class="item-name">${item.name}</div>
        <div class="item-sub">${item.email}</div>
      </div>
      <div class="badge-status status-pending">Pending</div>
    </div>
  `).join('');
}

// ── Google Sheet ─────────────────────────────────────────────────────────────
const sheetFetch = document.getElementById('sheetFetch');
sheetFetch?.addEventListener('click', async () => {
  const url = document.getElementById('sheetUrl').value.trim();
  if (!url) return;
  
  const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) return;
  const sheetId = sheetIdMatch[1];
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

  sheetFetch.disabled = true;
  sheetFetch.textContent = '...';

  try {
    const res = await fetch(csvUrl);
    const text = await res.text();
    const rows = text.split('\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
    if (rows.length < 2) throw new Error('Empty');
    
    allSheetData = rows;
    sheetColumns = rows[0];
    
    const nameSel = document.getElementById('sheetNameCol');
    const emailSel = document.getElementById('sheetEmailCol');
    const daySel = document.getElementById('sheetDayCol');
    
    [nameSel, emailSel, daySel].forEach(s => s.innerHTML = '');
    daySel.innerHTML = '<option value="-1">—</option>';
    
    sheetColumns.forEach((col, idx) => {
      const opt = `<option value="${idx}">${col}</option>`;
      nameSel.innerHTML += opt;
      emailSel.innerHTML += opt;
      daySel.innerHTML += opt;
    });
    
    document.getElementById('sheetCols').style.display = 'block';
    renderSheetPreview();
    sheetFetch.textContent = 'Fetch';
    sheetFetch.disabled = false;
  } catch (err) {
    alert(getTxt('fetchError'));
    sheetFetch.disabled = false;
    sheetFetch.textContent = 'Fetch';
  }
});

function renderSheetPreview() {
  const nameIdx = parseInt(document.getElementById('sheetNameCol').value);
  const emailIdx = parseInt(document.getElementById('sheetEmailCol').value);
  if (isNaN(nameIdx) || isNaN(emailIdx)) return;

  const items = allSheetData.slice(1).map(r => ({
    name: r[nameIdx],
    email: r[emailIdx],
    status: 'pending'
  })).filter(i => i.name && i.email.includes('@'));

  const list = document.getElementById('sheetPreviewList');
  const wrap = document.getElementById('sheetPreviewWrap');
  const count = document.getElementById('sheetPreviewCount');
  
  wrap.style.display = 'block';
  count.textContent = items.length;
  document.getElementById('sheetStart').disabled = items.length === 0;

  list.innerHTML = items.slice(0, 50).map(item => `
    <div class="list-item">
      <div>
        <div class="item-name">${item.name}</div>
        <div class="item-sub">${item.email}</div>
      </div>
      <div class="badge-status status-pending">Pending</div>
    </div>
  `).join('');
  
  chrome.storage.local.set({ queue: items, queueIndex: 0 });
}

document.getElementById('sheetNameCol')?.addEventListener('change', renderSheetPreview);
document.getElementById('sheetEmailCol')?.addEventListener('change', renderSheetPreview);

document.getElementById('sheetStart')?.addEventListener('click', async () => {
  const { queue } = await chrome.storage.local.get(['queue']);
  if (!queue || queue.length === 0) return;
  if (!await validateQueue(queue)) return;
  await chrome.storage.local.set({ isRunning: true });
  chrome.runtime.sendMessage({ action: 'resumeQueue' });
});

// ── History & Status ─────────────────────────────────────────────────────────
async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get(['history']);
  const list = document.getElementById('histList');
  if (!list) return;
  if (history.length === 0) {
    list.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);font-style:italic">No registrations yet</div>`;
    return;
  }
  list.innerHTML = history.slice(0, 100).map(h => `
    <div class="list-item">
      <div>
        <div class="item-name">${h.name}</div>
        <div class="item-sub">${h.finalUsername || h.username} · ${h.email}</div>
      </div>
      <div class="badge-status status-done">Done</div>
    </div>
  `).join('');
}

async function checkStatus() {
  const { isRunning, queue, queueIndex, copiedCreds } = await chrome.storage.local.get(['isRunning', 'queue', 'queueIndex', 'copiedCreds']);
  
  const globalBanner = document.getElementById('globalBatchBanner');
  const progText = document.getElementById('globalBatchProgress');
  if (isRunning && queue && queue.length > 0) {
    globalBanner.style.display = 'flex';
    progText.textContent = `${queueIndex} / ${queue.length} completed`;
  } else {
    globalBanner.style.display = 'none';
  }

  const clip = document.getElementById('clipBanner');
  if (copiedCreds && Date.now() < copiedCreds.expiresAt) {
    clip.classList.add('show');
    document.getElementById('clipText').textContent = `📋 ${copiedCreds.label || 'Copied'}`;
  } else {
    clip.classList.remove('show');
  }
}

setInterval(checkStatus, 1000);
loadSettings();
renderHistory();
