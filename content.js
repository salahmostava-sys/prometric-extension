// content.js - MAIN world
const LOGIN_URL = 'https://tcnet1.prometric.com/Login.aspx?ibt=785937226&ClientNameSingleSite=ibtamea';
const REGISTER_URL = 'https://tcnet1.prometric.com/Registration.aspx';
let ABORT_CURRENT_STEP = false;

function checkRunning() {
  if (ABORT_CURRENT_STEP) throw new Error('STOPPED');
}

const sleep = async ms => {
  const scaledMs = Math.round(ms * (PAGE_DELAY / 2000));
  await new Promise(r => setTimeout(r, Math.max(10, scaledMs)));
  checkRunning();
};
const wait = async ms => {
  await new Promise(r => setTimeout(r, ms));
  checkRunning();
};

let PAGE_DELAY = 2000;
let AUTO_SUBMIT = false;
let DEFAULT_ANSWER = 'a';
let GLOBAL_RUNNING = false;
let GLOBAL_SINGLE = false;
let STABILITY_MODE = false;

// -- Status indicator ---
function updateStatus(msg, color = '#3fb950', glowColor = 'rgba(63,185,80,0.25)') {
  let statusContainer = document.getElementById('__prom__');
  let statusTextElement = document.getElementById('__prom_txt__');
  let statusDot = document.getElementById('__prom_dot__');

  if (statusContainer) {
    statusContainer.style.border = `1px solid ${color}40`;
    statusContainer.style.boxShadow = `0 8px 32px 0 rgba(0,0,0,0.4), 0 0 15px ${glowColor}`;
    if (statusDot) statusDot.style.background = color;
  } else {
    // Add keyframes for animations if not present
    if (!document.getElementById('__prom_style__')) {
      const style = document.createElement('style');
      style.id = '__prom_style__';
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;700&display=swap');
        @keyframes __prom_fadeIn { from { opacity: 0; transform: translateY(-10px) translateX(-50%); } to { opacity: 1; transform: translateY(0) translateX(-50%); } }
        @keyframes __prom_pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
      `;
      document.head.appendChild(style);
    }

    statusContainer = document.createElement('div');
    statusContainer.id = '__prom__';
    // Premium glassmorphism center-top positioning
    statusContainer.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(13, 17, 23, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #f0f6fc;
      padding: 10px 18px;
      border-radius: 16px;
      border: 1px solid ${color}40;
      font-family: 'Outfit', -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 8px 32px 0 rgba(0,0,0,0.4), 0 0 15px ${glowColor};
      display: flex;
      align-items: center;
      gap: 12px;
      animation: __prom_fadeIn 0.3s ease-out;
      min-width: 280px;
    `;
    
    // Status dot
    statusDot = document.createElement('div');
    statusDot.id = '__prom_dot__';
    statusDot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${color};
      animation: __prom_pulse 1.5s ease-in-out infinite;
      box-shadow: 0 0 8px ${color};
      flex-shrink: 0;
    `;
    statusContainer.appendChild(statusDot);

    statusTextElement = document.createElement('div');
    statusTextElement.id = '__prom_txt__';
    statusTextElement.style.cssText = 'flex: 1; text-align: center; letter-spacing: 0.3px;';
    statusContainer.appendChild(statusTextElement);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 6px; flex-shrink: 0; margin-left: auto;';
    statusContainer.appendChild(btnContainer);

    // Add inline Pause for Batch mode
    if (globalThis.__isBatch) {
      const pauseBtn = document.createElement('button');
      pauseBtn.textContent = 'Pause';
      pauseBtn.style.cssText = `
        background: rgba(210,153,34,0.15);
        border: 1px solid rgba(210,153,34,0.3);
        color: #d29922;
        border-radius: 8px;
        cursor: pointer;
        padding: 5px 12px;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Outfit', sans-serif;
        transition: all 0.2s;
      `;
      pauseBtn.onmouseover = () => pauseBtn.style.background = 'rgba(210,153,34,0.25)';
      pauseBtn.onmouseout = () => pauseBtn.style.background = 'rgba(210,153,34,0.15)';
      pauseBtn.onclick = () => {
        if (pauseBtn.textContent.includes('Pause')) {
          send('pauseBatch'); 
          pauseBtn.textContent = 'Resume'; 
          pauseBtn.style.background = 'rgba(88,166,255,0.15)';
          pauseBtn.style.color = '#58a6ff';
          pauseBtn.style.borderColor = 'rgba(88,166,255,0.3)';
          pauseBtn.onmouseover = () => pauseBtn.style.background = 'rgba(88,166,255,0.25)';
          pauseBtn.onmouseout = () => pauseBtn.style.background = 'rgba(88,166,255,0.15)';
        } else {
          send('resumeBatch'); 
          pauseBtn.textContent = 'Pause'; 
          pauseBtn.style.background = 'rgba(210,153,34,0.15)';
          pauseBtn.style.color = '#d29922';
          pauseBtn.style.borderColor = 'rgba(210,153,34,0.3)';
          pauseBtn.onmouseover = () => pauseBtn.style.background = 'rgba(210,153,34,0.25)';
          pauseBtn.onmouseout = () => pauseBtn.style.background = 'rgba(210,153,34,0.15)';
        }
      };
      btnContainer.appendChild(pauseBtn);
    }
    
    // Stop button always available if active
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.style.cssText = `
      background: rgba(255,123,114,0.15);
      border: 1px solid rgba(255,123,114,0.3);
      color: #ff7b72;
      border-radius: 8px;
      cursor: pointer;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 700;
      font-family: 'Outfit', sans-serif;
      transition: all 0.2s;
    `;
    stopBtn.onmouseover = () => stopBtn.style.background = 'rgba(255,123,114,0.25)';
    stopBtn.onmouseout = () => stopBtn.style.background = 'rgba(255,123,114,0.15)';
    stopBtn.onclick = () => { 
      ABORT_CURRENT_STEP = true;
      send('stopBatch'); 
      statusContainer.remove(); 
    };
    btnContainer.appendChild(stopBtn);

    document.body?.appendChild(statusContainer);
  }
  statusTextElement.textContent = msg;
}

function send(action, payload) {
  globalThis.dispatchEvent(new CustomEvent('__prom_msg', { detail: { action, payload } }));
}

function pageSnippet() {
  return String(document.body?.innerText || document.body?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function failStep(reason, failureKind = 'page', retryable = true) {
  const name = currentItem ? `${currentItem.firstName || ''} ${currentItem.lastName || ''}`.trim() : '';
  updateStatus(`Error ${reason}`, '#d73a49');
  send('stepFailed', {
    name,
    reason,
    failureKind,
    retryable,
    url: globalThis.location.href,
    step: detectStep() || '',
    pageSnippet: pageSnippet(),
    queueId: currentItem?._queueId
  });
}

// -- Copy helper: reliable copy + saves to storage for 30s cross-tab access --
function copyText(text, label) {
  // 1. Try modern clipboard API
  if (navigator.clipboard && globalThis.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
  // 2. Save to chrome storage with 30-second expiry so popup can show it
  globalThis.dispatchEvent(new CustomEvent('__prom_msg', {
    detail: {
      action: 'saveCopied',
      payload: { text, label: label || '', expiresAt: Date.now() + 30000 }
    }
  }));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  // Not opacity:0 - some browsers reject invisible elements for clipboard
  ta.style.cssText = 'position:fixed;top:50%;left:50%;width:2px;height:2px;opacity:0.01;border:none;outline:none;resize:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy', false, null); } catch(err) { console.warn(err); }
  ta.remove();
}

// -- Fill field (native setter + events) ---

async function waitFor(sels, timeout = 10000) {
  const arr = Array.isArray(sels) ? sels : [sels];
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of arr) {
      const e = document.querySelector(s);
      if (e) return e;
    }
    await sleep(150);
  }
  return null;
}


function nextSuffix(s) {
  if (s === '') return '1';
  const n = Number.parseInt(s, 10);
  if (!Number.isNaN(n)) {
    if (n < 99) return String(n + 1);
    return 'a';
  }
  let res = '';
  let carry = true;
  for (let i = s.length - 1; i >= 0; i--) {
    if (carry) {
      if (s.codePointAt(i) < 122) {
        res = String.fromCodePoint(s.codePointAt(i) + 1) + res;
        carry = false;
      } else {
        res = 'a' + res;
      }
    } else {
      res = s[i] + res;
    }
  }
  if (carry) res = 'a' + res;
  return res.length > 3 ? null : res;
}

function detectStep() {
  const text = document.body.textContent || '';
  if (text.includes('Sign Out') && text.includes('Update Information')) return 'dashboard';

  // Policy page: has "I AGREE" checkbox or "I Consent" radio
  // Check for keywords in body text first as a quick and highly efficient bypass.
  if (text.includes('I AGREE') && document.querySelector('input[type="checkbox"]')) return 'policy';
  if (text.includes('PERSONAL DATA PRIVACY') || text.includes('I Consent')) return 'policy';

  if (querySelectorAny('input[placeholder="First Name"]', 'input[id*="FirstName" i]')) return 'profile';
  if (querySelectorAny('input[id*="Username" i]', 'input[placeholder*="Username" i]')) return 'signin';
  if (querySelectorAny('select') && (text.includes('Prometric Info') || text.includes('Test Provider') || text.includes('Test Provider or Program'))) return 'prometric';
  return null;
}

// -- STEP 1 - Prometric Info ---
async function fillStep1() {
  updateStatus('Step 1: Selecting IBTA MEA...');
  const sel = await waitFor(['select']);
  if (!sel) { failStep('Prometric select not found', 'missing-field', true); return; }
  
  // Wait up to 5 seconds for "IBTA MEA" option to load dynamically
  let selected = false;
  for (let i = 0; i < 25; i++) {
    if (fillSelect(sel, 'IBTA MEA')) {
      selected = true;
      break;
    }
    await sleep(200);
  }

  if (!selected) {
    failStep('Option IBTA MEA not found in dropdown', 'missing-field', true);
    return;
  }

  await sleep(300); // Turbo: reduced from 2000
  clickContinue();
}

async function waitForUsernameValidation(maxMs = 4000) {
  const t0 = Date.now();
  const errorKeywords = [
    'username already found',
    'already found, please',
    'username already exists',
    'already in use',
    'username is not available',
    'not available'
  ];
  while (Date.now() - t0 < maxMs) {
    await sleep(150);
    const bodyText = (document.body.textContent || '').toLowerCase();
    const hasPossibleError = errorKeywords.some(kw => bodyText.includes(kw));
    if (!hasPossibleError) continue;

    const taken = [...document.querySelectorAll('span,div,p,label,td')].some(el => {
      if (!el.offsetParent || el.childElementCount > 0) return false;
      const t = (el.textContent || '').toLowerCase().trim();
      return errorKeywords.some(kw => t.includes(kw));
    });
    if (taken) return true;
  }
  return false;
}

async function tryFillUsername(tryName, userEl) {
  function getField() {
    return document.querySelector('input[id*="Username" i]') ||
           document.querySelector('input[placeholder*="Username" i]') ||
           document.querySelector('input[name*="Username" i]') ||
           userEl;
  }

  let el = getField();
  el.focus();
  el.select();
  setVal(el, '');
  triggerEvents(el, ['input', 'change']);
  await sleep(400);

  const waitForErrorClearStart = Date.now();
  while (Date.now() - waitForErrorClearStart < 2500) {
    const stillOld = [...document.querySelectorAll('span,div,p,label,td')].some(el => {
      if (!el.offsetParent || el.childElementCount > 0) return false;
      const t = (el.textContent || '').toLowerCase().trim();
      return t.includes('username already found') || t.includes('already found, please');
    });
    if (!stillOld) break;
    await sleep(150);
  }

  el = getField();
  el.focus();
  el.select();
  setVal(el, '');
  await sleep(100);

  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) nativeSetter.call(el, tryName);
  else el.value = tryName;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: tryName, inputType: 'insertText' }));
  triggerEvents(el, ['change']);
  await sleep(100);

  for (let attempt = 0; attempt < 3; attempt++) {
    const checkEl = getField();
    if (checkEl.value === tryName) break;
    
    checkEl.focus();
    checkEl.select();
    if (nativeSetter) nativeSetter.call(checkEl, tryName);
    else checkEl.value = tryName;
    checkEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: tryName, inputType: 'insertText' }));
    triggerEvents(checkEl, ['change', 'keydown', 'keyup']);
    await sleep(200);
  }

  blurEl(getField());
  return await waitForUsernameValidation(3000);
}

async function fillUsernameWithRetry(creds, userEl) {
  let suffix = '';
  while (true) {
    const tryName = creds.username + suffix;
    updateStatus(`Trying username: ${tryName}`);

    const taken = await tryFillUsername(tryName, userEl);

    if (!taken) {
      creds.finalUsername = tryName;
      send('updateItem', creds);
      updateStatus('Username OK');
      return true;
    }
    updateStatus(`Warning "${tryName}" taken, trying next...`, '#d29922');
    const next = nextSuffix(suffix);
    if (!next) { 
      failStep('Username exhausted', 'validation', false); 
      return false; 
    }
    suffix = next;
  }
}

async function fillPasswords(password) {
  updateStatus('Step 2: Password...');
  const pwAll = [...document.querySelectorAll('input[type="password"]')];
  for (let i = 0; i < Math.min(pwAll.length, 2); i++) {
    pwAll[i].focus();
    setVal(pwAll[i], password);
    await sleep(10);
  }
  return pwAll;
}

async function fillSecurityQuestions() {
  updateStatus('Step 2: Security questions...');
  const qDropdown = querySelectorAny('select[id*="Question" i]', 'select[name*="Question" i]');
  if (qDropdown) {
    qDropdown.focus();
    triggerEvents(qDropdown, ['change']);
    await sleep(400);
  }

  const textInputs = [...document.querySelectorAll('input')].filter(inp => {
    if (!inp.offsetParent) return false;
    const t = (inp.type || 'text').toLowerCase();
    if (['submit', 'button', 'checkbox', 'radio', 'hidden', 'file', 'password'].includes(t)) return false;
    const combo = [(inp.id || ''), (inp.name || ''), (inp.placeholder || '')].join(' ').toLowerCase();
    return !combo.includes('username');
  });
  for (const inp of textInputs) {
    inp.focus();
    setVal(inp, DEFAULT_ANSWER);
    await sleep(10);
  }

  document.querySelectorAll('input[placeholder*="Question Answered" i],input[id*="Answer" i],input[name*="Answer" i]')
    .forEach(inp => { if (inp.offsetParent) { inp.focus(); setVal(inp, DEFAULT_ANSWER); } });

  [...document.querySelectorAll('input,select')].forEach(el => { if (el.offsetParent) blurEl(el); });
}

async function verifyPasswords(pwAll, password) {
  await sleep(150);
  for (let i = 0; i < Math.min(pwAll.length, 2); i++) {
    if (!pwAll[i].value) {
      pwAll[i].focus();
      setVal(pwAll[i], password);
      blurEl(pwAll[i]);
    }
  }
}

// -- STEP 2 - Sign In Info ---
async function fillStep2(creds) {
  updateStatus('Step 2: Username...');
  const userEl = await waitFor([
    'input[id*="Username" i]',
    'input[placeholder*="Username" i]',
    'input[name*="Username" i]'
  ]);
  if (!userEl) { failStep('Username field not found', 'missing-field', true); return; }

  const success = await fillUsernameWithRetry(creds, userEl);
  if (!success) return;

  const pwAll = await fillPasswords(creds.password);
  await fillSecurityQuestions();
  await verifyPasswords(pwAll, creds.password);

  await sleep(300);
  updateStatus('Step 2: Submitting...');
  clickContinue();
}

// -- STEP 3 - Profile Info ---
async function fillStep3(creds) {
  updateStatus('Step 3: Profile Info...');
  const fnEl = await waitFor([
    'input[placeholder="First Name"]',
    'input[id*="FirstName" i]',
    'input[name*="FirstName" i]'
  ]);
  if (!fnEl) { failStep('First Name field not found', 'missing-field', true); return; }

  const lnEl = querySelectorAny('input[placeholder="Last Name"]', 'input[id*="LastName" i]');
  
  if (creds.needsBypass || (creds.firstName && creds.firstName.length > 20) || (creds.lastName && creds.lastName.length > 20)) {
    updateStatus('Smart Mode: Bypassing site character limit...');
    if (fnEl) fnEl.removeAttribute('maxlength');
    if (lnEl) lnEl.removeAttribute('maxlength');
    await sleep(100);
  }

  await sleep(200);
  setVal(fnEl, creds.firstName);
  setVal(lnEl, creds.lastName);
  setVal(querySelectorAny('input[placeholder="Mailing Address"]', 'input[id*="Address1" i]'), creds.mailingAddress || 'Al-Alameya');
  setVal(querySelectorAny('input[placeholder="City"]', 'input[id*="City" i]'), creds.city || 'JEDDAH');
  setVal(querySelectorAny('input[placeholder="State/Province"]', 'input[id*="State" i]'), creds.state || 'JEDDAH');
  setVal(querySelectorAny('input[placeholder="Postal Code"]', 'input[id*="Postal" i]', 'input[id*="Zip" i]'), creds.postalCode || '00000');
  fillSelect(querySelectorAny('select[id*="Country" i]', 'select[name*="Country" i]'), creds.country || 'Saudi Arabia');
  await sleep(100);
  setVal(querySelectorAny('input[type="email"]', 'input[placeholder="Email Address"]', 'input[id*="Email" i]', 'input[name*="Email" i]'), creds.email);

  // Blur all to trigger validators
  [...document.querySelectorAll('input,select')].forEach(el => { if (el.offsetParent) blurEl(el); });

  await sleep(300); // Turbo: reduced from 2000
  updateStatus('Step 3: Submitting...');
  clickContinue();
  // One submit only — the MutationObserver in run() detects the AJAX transition
  // to Step 4 and calls fillStep4 automatically; a second click here would double-submit.
}

// -- STEP 4 - Confirm Policy ---

async function ensureSelected() {
  const agreeChk = querySelectorAny(
    'input[type="checkbox"][id*="Agree" i]',
    'input[type="checkbox"][id*="agree" i]',
    'input[type="checkbox"]'
  );
  if (agreeChk && !agreeChk.checked) {
    agreeChk.click();
    triggerEvents(agreeChk, ['change', 'input']);
    await wait(500);
  }

  const allRadios = [...document.querySelectorAll('input[type="radio"]')];
  const consentRadio = allRadios.find(r => {
    const text = (
      r.closest('label')?.textContent ||
      (r.id ? document.querySelector(`label[for="${r.id}"]`)?.textContent : '') ||
      r.labels?.[0]?.textContent ||
      r.nextElementSibling?.textContent ||
      r.nextSibling?.textContent ||
      ''
    ).trim().toLowerCase();
    return (text === 'i consent' || text.startsWith('i consent')) && !text.includes('do not');
  });
  if (consentRadio && !consentRadio.checked) {
    consentRadio.click();
    triggerEvents(consentRadio, ['change', 'input']);
    await wait(500);
  }
}

function findReadyContinue() {
  const candidates = [
    ...document.querySelectorAll('input[id*="Continue" i], button[id*="Continue" i], a[id*="Continue" i]'),
    ...document.querySelectorAll('input[type="submit"], button, input[type="button"], a, [role="button"]')
  ];

  return candidates.find(el => {
    if (!el.offsetParent || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    const text = (el.value || el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase();
    if (!(text === 'continue' || text.startsWith('continue') || text === 'next' || text.includes('continue'))) return false;
    const style = globalThis.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none';
  });
}

async function fillStep4(creds) {
  updateStatus('Step 4: Confirm Policy...');

  const deadline = Date.now() + (STABILITY_MODE ? 60000 : 30000);
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;
    updateStatus(`Step 4: Waiting for Continue...`);
    await ensureSelected();

    const btn = findReadyContinue();
    if (btn) {
      updateStatus(`Step 4: Continue found, submitting...`);
      forceClick(btn);
      await wait(2500);
      if (detectStep() !== 'policy') return; 
      if (attempts % 4 === 0) {
        updateStatus('Step 4: Still on policy, retrying...', '#d29922');
      }
    }

    await wait(400);
  }
  
  failStep('Continue did not become ready on Step 4', 'timeout', true);
}

// -- FINAL STEP - Dashboard ---
function injectDashboardStyles() {
  if (document.getElementById('__prom_styles')) return;
  const style = document.createElement('style');
  style.id = '__prom_styles';
  style.textContent = `
    #__prom_card { position:fixed;inset:0;background:rgba(9, 13, 22, 0.85);backdrop-filter:blur(10px);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:sans-serif }
    #__prom_box { background:rgba(22, 27, 34, 0.8);border:1px solid rgba(240, 246, 252, 0.1);border-radius:20px;padding:32px 36px;min-width:440px;max-width:540px;width:92vw;color:#f0f6fc;box-shadow:0 24px 64px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(8px) }
    .__prom_title { color:#2ea043;font-size:26px;font-weight:800;margin-bottom:12px;text-align:center;letter-spacing:-.3px;background:linear-gradient(135deg, #2ea043 0%, #3fb950 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent }
    .__prom_row { background:rgba(33, 38, 45, 0.4);border:1px solid rgba(240,246,252,0.06);border-radius:12px;padding:14px 18px }
    .__prom_row_label { color:#8b949e;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;font-weight:700 }
    .__prom_countdown { display:none;align-items:center;justify-content:center;gap:10px;margin-bottom:6px;font-size:12px;color:#8b949e }
    #__prom_action { width:100%;padding:14px;background:linear-gradient(135deg, #2ea043 0%, #3fb950 100%);border:none;color:#fff;border-radius:12px;cursor:pointer;font-weight:800;font-size:15px;letter-spacing:.3px;transition:all 0.25s ease;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 4px 12px rgba(46,160,67,0.2) }
    #__prom_action:hover { transform:translateY(-1px);box-shadow:0 6px 16px rgba(46,160,67,0.3) }
    #__prom_action:active { transform:scale(.98) }
    #__prom_done_msg { margin-top:10px;text-align:center;font-size:12px;color:#7d8590;display:none }
    #__prom_countdown_circle { transform:rotate(-90deg);transform-origin:50% 50%;transition:stroke-dashoffset 0.1s linear }
  `;
  document.head.appendChild(style);
}

function createDashboardOverlay(user, creds, isBatch) {
  injectDashboardStyles();
  const card = document.createElement('div');
  card.id = '__prom_card';
  card.innerHTML = `
    <div id="__prom_box">
      <div class="__prom_title">OK Registration Complete!</div>
      <div class="__prom_row">
        <div class="__prom_row_label">Name</div>
        <div style="font-weight:700;font-size:15px;color:#f0f6fc">${creds.firstName} ${creds.lastName}</div>
      </div>
      <div class="__prom_row">
        <div class="__prom_row_label">Username</div>
        <div style="font-weight:700;color:#58a6ff;font-family:monospace;font-size:16px;word-break:break-all">${user}</div>
      </div>
      <div class="__prom_row" style="margin-bottom:10px">
        <div class="__prom_row_label">Password</div>
        <div style="font-weight:700;font-family:monospace;font-size:16px;color:#f0f6fc">${creds.password}</div>
      </div>
      <div id="__prom_countdown_container" class="__prom_countdown">
        <svg width="18" height="18" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(88,166,255,0.15)" stroke-width="2"/>
          <circle id="__prom_countdown_circle" cx="10" cy="10" r="8" fill="none" stroke="#58a6ff" stroke-width="2" stroke-dasharray="50" stroke-dashoffset="0" stroke-linecap="round"/>
        </svg>
        <span id="__prom_countdown_text">Auto-continuing in 2.0s...</span>
      </div>
      <button id="__prom_action">${isBatch ? 'Copy & Continue' : 'Copy & Finish'}</button>
      <div id="__prom_done_msg">OK Copied - ${isBatch ? 'signing out...' : 'finishing...'}</div>
    </div>
  `;
  document.body.appendChild(card);
  const actionBtn = document.getElementById('__prom_action');
  return { card, actionBtn };
}

function startDashboardCountdown(actionBtn) {
  const container = document.getElementById('__prom_countdown_container');
  if (container) container.style.display = 'flex';

  const circle = document.getElementById('__prom_countdown_circle');
  const textSpan = document.getElementById('__prom_countdown_text');
  const duration = 2000;
  const t0 = Date.now();

  const interval = setInterval(() => {
    if (ABORT_CURRENT_STEP) {
      clearInterval(interval);
      return;
    }
    const elapsed = Date.now() - t0;
    const pct = Math.max(0, 1 - elapsed / duration);
    if (circle) circle.style.strokeDashoffset = 50 * (1 - pct);
    const remainingSecs = (pct * 2).toFixed(1);
    if (textSpan) textSpan.textContent = `Auto-continuing in ${remainingSecs}s...`;

    if (elapsed >= duration) {
      clearInterval(interval);
      actionBtn.click();
    }
  }, 50);
}

function performSignOut() {
  updateStatus('Signing out...');
  const signOut = [...document.querySelectorAll('a,span,div,button')]
    .find(e => (e.textContent||'').trim() === 'Sign Out' && e.tagName !== 'SCRIPT');
  if (signOut) signOut.click();
  else globalThis.location.href = LOGIN_URL;
}

async function handleDashboard(creds) {
  if (document.getElementById('__prom_card')) return;

  updateStatus('OK Registration Complete!');

  const user    = creds.finalUsername || creds.username;
  const isBatch = globalThis.__isBatch;

  const { card, actionBtn } = createDashboardOverlay(user, creds, isBatch);

  actionBtn.addEventListener('click', async () => {
    actionBtn.disabled = true;
    actionBtn.style.background = '#238636';
    actionBtn.textContent = 'OK Copied!';
    document.getElementById('__prom_done_msg').style.display = 'block';

    copyText(`${user}\t${creds.password}`, `${user} / ${creds.password}`);

    await sleep(900);
    card.remove();
    if (isBatch) {
      performSignOut();
      await sleep(500);
    }

    send('stepDone', {
      finalUsername: user,
      password:      creds.password,
      name:          creds.firstName + ' ' + creds.lastName,
      email:         creds.email,
      url:           globalThis.location.href,
      step:          detectStep() || 'dashboard',
      queueId:       creds._queueId
    });
  });

  if (AUTO_SUBMIT || isBatch) {
    startDashboardCountdown(actionBtn);
  }
}

// -- Navigation ---
async function handleInvalidHostHeader() {
  if (document.readyState !== 'complete') await new Promise(r => globalThis.addEventListener('load', r, { once: true }));
  await sleep(300);
  globalThis.location.href = LOGIN_URL;
}

async function handleLoginPage() {
  if (document.readyState !== 'complete') await new Promise(r => globalThis.addEventListener('load', r, { once: true }));
  await sleep(500);
  const link = [...document.querySelectorAll('a,button,input[type=submit]')]
    .find(el => { const t = (el.textContent || el.value || '').toLowerCase(); return t.includes('register') || t.includes('new user') || t.includes('first time'); });
  if (link) link.click();
  else globalThis.location.href = REGISTER_URL;
}

// -- MAIN ---
let filledStep = null;
let filling = false;
let currentItem = null;
let observer = null;

async function handleStep(step) {
  const pageText = document.body.textContent || '';
  const hasError = pageText.includes('information provided is not valid') || 
                   pageText.includes('is required') ||
                   !!document.querySelector('.error, .errorMessage, [id*="Error" i], [class*="Error" i]');
  
  if (hasError && filledStep === step) {
    filledStep = null; // Allow retry
  }

  if (filling || step === filledStep) return;
  if (!currentItem) { updateStatus('Warning No data', '#d73a49'); return; }
  if (!GLOBAL_RUNNING && !GLOBAL_SINGLE) {
    updateStatus('Paused/Stopped', '#6e7681');
    return;
  }
  
  filling = true;
  filledStep = step;
  await sleep(PAGE_DELAY);
  
  if (!GLOBAL_RUNNING && !GLOBAL_SINGLE) { filling = false; return; }
  
  const stepHandlers = {
    dashboard: () => handleDashboard(currentItem),
    policy: () => fillStep4(currentItem),
    profile: () => fillStep3(currentItem),
    signin: () => fillStep2(currentItem),
    prometric: () => fillStep1()
  };

  try {
    if (stepHandlers[step]) {
      await stepHandlers[step]();
    }
  } catch (e) {
    // Always reset filling before any early-return so that a Resume after Stop
    // doesn't get permanently blocked by a stale filling=true.
    filling = false;
    if (e.message === 'STOPPED') return;
    failStep(e.message || 'Unhandled content error', 'exception', true);
    console.error('[Prometric]', e);
    // Do not re-throw: handleStep is called from MutationObserver async callbacks
    // which have no surrounding catch, so re-throwing produces unhandled rejections.
    // The error is fully reported via failStep() and console.error above.
    return;
  }
  filling = false;

  if (step === 'policy') {
    setTimeout(() => {
      if (detectStep() === 'policy') filledStep = null;
    }, 4000);
  }
}

async function run() {
  const url = globalThis.location.href;

  // Wait for state from bridge.js
  const state = await new Promise(resolve => {
    globalThis.addEventListener('__prom_init', e => resolve(e.detail), { once: true });
    globalThis.dispatchEvent(new CustomEvent('__prom_ready'));
    setTimeout(() => resolve(null), 1500);
  });

  // If extension is not explicitly running, do NOTHING.
  if (!state || (!state.isRunning && !state.singleRunning)) {
    return;
  }

  globalThis.__isBatch = state.isRunning;
  GLOBAL_RUNNING = state.isRunning;
  GLOBAL_SINGLE = state.singleRunning;
  updateStatus('Active...', '#0969da');
  currentItem = state.currentItem;

  if (url.includes('InvalidHostHeader')) { await handleInvalidHostHeader(); return; }
  if (url.includes('Login.aspx')) { await handleLoginPage(); return; }

  if (document.readyState !== 'complete') await new Promise(r => globalThis.addEventListener('load', r, { once: true }));
  await sleep(800);

  if (!currentItem) { failStep('No active data for page', 'state', true); return; }

  let step = null;
  for (let i = 0; i < 20; i++) {
    step = detectStep();
    if (step) break;
    await sleep(150);
  }
  if (step) await handleStep(step);
  else failStep('Could not detect registration step', 'page', true);

  // Watch for UpdatePanel (AJAX) step changes.
  // Disconnect any stale observer before creating a fresh one — prevents duplicate
  // handlers if run() is somehow called twice on the same page.
  if (observer) { observer.disconnect(); observer = null; }
  observer = new MutationObserver(async () => {
    if (filling) return;
    // Also stop observing if the extension was paused/stopped after page load
    if (!GLOBAL_RUNNING && !GLOBAL_SINGLE) return;
    const s = detectStep();
    if (s && s !== filledStep && currentItem) await handleStep(s);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

globalThis.addEventListener('__prom_init', e => { 
  if (e.detail?.currentItem) currentItem = e.detail.currentItem; 
  if (e.detail?.pageDelay !== undefined) PAGE_DELAY = e.detail.pageDelay * 1000;
  if (e.detail?.autoSubmit !== undefined) AUTO_SUBMIT = e.detail.autoSubmit;
  if (e.detail?.stabilityMode !== undefined) STABILITY_MODE = e.detail.stabilityMode;
  if (e.detail?.defAnswer !== undefined) DEFAULT_ANSWER = e.detail.defAnswer;
  if (e.detail?.isRunning !== undefined) GLOBAL_RUNNING = e.detail.isRunning;
  if (e.detail?.singleRunning !== undefined) GLOBAL_SINGLE = e.detail.singleRunning;
  // NOTE: We intentionally do NOT disconnect the observer here — this event
  // fires on Pause too, and disconnecting would prevent Resume from working
  // (the page wouldn't react to DOM changes after resumption).
  // The observer callback already has a GLOBAL_RUNNING/GLOBAL_SINGLE guard.
});
(async () => { try { await run(); } catch (e) { if (e.message !== 'STOPPED') updateStatus('Error ' + e.message, '#d73a49'); } })();
