// content.js — MAIN world
const LOGIN_URL = 'https://tcnet1.prometric.com/Login.aspx?ibt=785937226&ClientNameSingleSite=ibtamea';
const REGISTER_URL = 'https://tcnet1.prometric.com/Registration.aspx';
const sleep = ms => {
  const scaledMs = Math.round(ms * (PAGE_DELAY / 2000));
  return new Promise(r => setTimeout(r, Math.max(10, scaledMs)));
};

let PAGE_DELAY = 2000;
let AUTO_SUBMIT = false;
let DEFAULT_ANSWER = 'a';
let GLOBAL_RUNNING = false;
let GLOBAL_SINGLE = false;

// ── Status indicator ──────────────────────────────────────────────────────────
function status(msg, color = '#2ea043') {
  let el = document.getElementById('__prom__');
  let txtEl = document.getElementById('__prom_txt__');

  if (!el) {
    el = document.createElement('div');
    el.id = '__prom__';
    el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;background:#2ea043;color:#fff;padding:8px 14px;border-radius:8px;font:bold 13px/1.4 sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);max-width:320px;display:flex;align-items:center;gap:12px';
    
    txtEl = document.createElement('div');
    txtEl.id = '__prom_txt__';
    txtEl.style.flex = '1';
    el.appendChild(txtEl);

    // Add inline Pause for Batch mode
    if (window.__isBatch) {
      const pauseBtn = document.createElement('button');
      pauseBtn.textContent = '⏸ Pause';
      pauseBtn.style.cssText = 'background:rgba(0,0,0,0.2);border:none;color:#fff;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;font-weight:bold';
      pauseBtn.onclick = () => {
        if (pauseBtn.textContent.includes('Pause')) {
          send('pauseBatch'); pauseBtn.textContent = '▶ Resume'; pauseBtn.style.background = 'rgba(0,0,0,0.4)';
        } else {
          send('resumeBatch'); pauseBtn.textContent = '⏸ Pause'; pauseBtn.style.background = 'rgba(0,0,0,0.2)';
        }
      };
      el.appendChild(pauseBtn);
    }
    
    // Stop button always available if active
    const stopBtn = document.createElement('button');
    stopBtn.textContent = '⏹ Stop';
    stopBtn.style.cssText = 'background:rgba(255,0,0,0.5);border:none;color:#fff;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;font-weight:bold';
    stopBtn.onclick = () => { send('stopBatch'); el.remove(); };
    el.appendChild(stopBtn);

    document.body?.appendChild(el);
  } else {
    el.style.background = color;
  }
  txtEl.textContent = '⚡ ' + msg;
}

function send(action, payload) {
  window.dispatchEvent(new CustomEvent('__prom_msg', { detail: { action, payload } }));
}

// ── Copy helper: reliable copy + saves to storage for 30s cross-tab access ──
function copyText(text, label) {
  // 1. Try modern clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
  // 2. Save to chrome storage with 30-second expiry so popup can show it
  window.dispatchEvent(new CustomEvent('__prom_msg', {
    detail: {
      action: 'saveCopied',
      payload: { text, label: label || '', expiresAt: Date.now() + 30000 }
    }
  }));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  // Not opacity:0 — some browsers reject invisible elements for clipboard
  ta.style.cssText = 'position:fixed;top:50%;left:50%;width:2px;height:2px;opacity:0.01;border:none;outline:none;resize:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(_) {}
  document.body.removeChild(ta);
}

// ── Fill field (native setter + events) ──────────────────────────────────────
function setVal(el, value) {
  if (!el) return;
  try {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(value));
  } catch (_) { el.value = String(value); }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function blurEl(el) {
  if (!el) return;
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

function fillSelect(sel, text) {
  if (!sel) return;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].text.toLowerCase().includes(text.toLowerCase())) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
}

function q(...sels) {
  for (const s of sels) { try { const e = document.querySelector(s); if (e) return e; } catch (_) { } }
  return null;
}

async function waitFor(sels, timeout = 10000) {
  const arr = Array.isArray(sels) ? sels : [sels];
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of arr) { try { const e = document.querySelector(s); if (e) return e; } catch (_) { } }
    await sleep(150);
  }
  return null;
}

function clickContinue() {
  const btn = [...document.querySelectorAll('input[type=submit],button')]
    .find(e => (e.value || e.textContent || '').trim() === 'Continue');
  if (btn) btn.click();
}

function nextSuffix(s) {
  if (s === '') return '1';
  const n = parseInt(s, 10);
  if (!isNaN(n) && n < 9) return String(n + 1);
  if (!isNaN(n)) return 'a';
  const c = s.charCodeAt(0);
  return c < 122 ? String.fromCharCode(c + 1) : null;
}

function detectStep() {
  const text = document.body.textContent || '';
  if (text.includes('Sign Out') && text.includes('Update Information')) return 'dashboard';

  // Policy page: has "I AGREE" checkbox or "I Consent" radio
  if (document.querySelector('input[type="checkbox"]') &&
    [...document.querySelectorAll('*')].some(el =>
      el.childElementCount === 0 &&
      (el.textContent || '').trim() === 'I AGREE'
    )) return 'policy';
  if ([...document.querySelectorAll('h2,h3,h4,b,strong,div')].some(el =>
    el.childElementCount === 0 &&
    (el.textContent || '').includes('PERSONAL DATA PRIVACY')
  )) return 'policy';

  if (q('input[placeholder="First Name"]', 'input[id*="FirstName" i]')) return 'profile';
  if (q('input[id*="Username" i]', 'input[placeholder*="Username" i]')) return 'signin';
  if (document.querySelector('select')) return 'prometric';
  return null;
}

// ── STEP 1 — Prometric Info ───────────────────────────────────────────────────
async function fillStep1() {
  status('Step 1: Selecting IBTA MEA…');
  const sel = await waitFor(['select']);
  if (!sel) return;
  await sleep(100);
  fillSelect(sel, 'IBTA MEA');
  await sleep(300); // Turbo: reduced from 2000
  clickContinue();
}

// ── STEP 2 — Sign In Info ─────────────────────────────────────────────────────
async function fillStep2(creds) {
  status('Step 2: Username…');
  const userEl = await waitFor([
    'input[id*="Username" i]',
    'input[placeholder*="Username" i]',
    'input[name*="Username" i]'
  ]);
  if (!userEl) { status('❌ Username field not found', '#d73a49'); return; }

  // Username + retry if taken
  // Dynamic wait: polls up to 4s for server validation response
  async function waitForUsernameValidation(maxMs = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      await sleep(150); // Turbo: reduced from 300
      const taken = [...document.querySelectorAll('span,div,p,label,td')].some(el => {
        if (!el.offsetParent || el.childElementCount > 0) return false;
        const t = (el.textContent || '').toLowerCase().trim();
        return (
          t.includes('username already found') ||
          t.includes('already found, please') ||
          t.includes('username already exists') ||
          t.includes('already in use')
        );
      });
      if (taken) return true;
      // Also check if the field border turned red (CSS validation)
      const style = window.getComputedStyle(userEl);
      const borderColor = style.borderColor || style.border || '';
      if (borderColor.includes('255, 0') || borderColor.includes('rgb(255,0') || borderColor.includes('f85149')) return true;
    }
    return false; // no error found → name is available
  }

  let suffix = '';
  while (true) {
    const tryName = creds.username + suffix;
    status(`Trying username: ${tryName}`);

    // ── Step 1: Query the field fresh every iteration ──────────────────────────
    function getField() {
      return document.querySelector('input[id*="Username" i]') ||
             document.querySelector('input[placeholder*="Username" i]') ||
             document.querySelector('input[name*="Username" i]') ||
             userEl;
    }

    // ── Step 2: Clear the field ────────────────────────────────────────────────
    let el = getField();
    el.focus();
    el.select();
    setVal(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);

    // ── Step 3: Wait until error disappears (UpdatePanel will refresh DOM) ─────
    const t_clear = Date.now();
    while (Date.now() - t_clear < 2500) {
      const stillOld = [...document.querySelectorAll('span,div,p,label,td')].some(el => {
        if (!el.offsetParent || el.childElementCount > 0) return false;
        const t = (el.textContent || '').toLowerCase().trim();
        return t.includes('username already found') || t.includes('already found, please');
      });
      if (!stillOld) break;
      await sleep(150);
    }

    // ── Step 4: Re-query AFTER UpdatePanel may have replaced the element ───────
    el = getField();
    el.focus();

    // Clear any leftover value first
    el.select();
    setVal(el, '');
    await sleep(100);

    // Write the new username using native setter
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(el, tryName);
    else el.value = tryName;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: tryName, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(100);

    // ── Step 5: Verify value actually appears in the field ────────────────────
    const checkEl = getField();
    if (checkEl.value !== tryName) {
      // DOM was replaced again — write one more time
      checkEl.focus();
      checkEl.select();
      if (nativeSetter) nativeSetter.call(checkEl, tryName);
      else checkEl.value = tryName;
      checkEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: tryName, inputType: 'insertText' }));
      checkEl.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(100);
    }

    blurEl(getField());

    // ── Step 6: Wait for server validation (dynamic, up to 4s) ───────────────
    const taken = await waitForUsernameValidation(3000);

    if (!taken) {
      creds.finalUsername = tryName;
      send('updateItem', creds);
      status('Username OK ✓');
      break;
    }
    status(`⚠️ "${tryName}" taken, trying next…`, '#d29922');
    const next = nextSuffix(suffix);
    if (!next) { send('stepFailed', { name: creds.firstName + ' ' + creds.lastName }); return; }
    suffix = next;
  }

  // Password (first 2 password inputs)
  status('Step 2: Password…');
  const pwAll = [...document.querySelectorAll('input[type="password"]')];
  for (let i = 0; i < Math.min(pwAll.length, 2); i++) {
    pwAll[i].focus();
    setVal(pwAll[i], creds.password);
    await sleep(10); // Turbo: reduced from 80
  }

  // Security questions: trigger dropdown then fill text inputs
  status('Step 2: Security questions…');
  const qDropdown = q('select[id*="Question" i]', 'select[name*="Question" i]');
  if (qDropdown) {
    qDropdown.focus();
    qDropdown.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
  }

  // Fill all visible text inputs (not username)
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
    await sleep(10); // Turbo: reduced from 60
  }

  // Also target Question Answered fields directly
  document.querySelectorAll('input[placeholder*="Question Answered" i],input[id*="Answer" i],input[name*="Answer" i]')
    .forEach(inp => { if (inp.offsetParent) { inp.focus(); setVal(inp, DEFAULT_ANSWER); } });

  await sleep(200);

  // Blur all to trigger validators
  [...document.querySelectorAll('input,select')].forEach(el => { if (el.offsetParent) blurEl(el); });

  // Re-verify passwords not cleared
  await sleep(150);
  for (let i = 0; i < Math.min(pwAll.length, 2); i++) {
    if (!pwAll[i].value) {
      pwAll[i].focus();
      setVal(pwAll[i], creds.password);
      blurEl(pwAll[i]);
    }
  }

  await sleep(300); // Turbo: reduced from 2000
  status('Step 2: Submitting…');
  clickContinue();
  // No second click here — MutationObserver handles next step
}

// ── STEP 3 — Profile Info ─────────────────────────────────────────────────────
async function fillStep3(creds) {
  status('Step 3: Profile Info…');
  const fnEl = await waitFor([
    'input[placeholder="First Name"]',
    'input[id*="FirstName" i]',
    'input[name*="FirstName" i]'
  ]);
  if (!fnEl) { status('❌ First Name not found', '#d73a49'); return; }

  await sleep(200);
  setVal(fnEl, creds.firstName);
  setVal(q('input[placeholder="Last Name"]', 'input[id*="LastName" i]'), creds.lastName);
  setVal(q('input[placeholder="Mailing Address"]', 'input[id*="Address1" i]'), creds.mailingAddress || 'Al-Alameya');
  setVal(q('input[placeholder="City"]', 'input[id*="City" i]'), creds.city || 'JEDDAH');
  setVal(q('input[placeholder="State/Province"]', 'input[id*="State" i]'), creds.state || 'JEDDAH');
  setVal(q('input[placeholder="Postal Code"]', 'input[id*="Postal" i]', 'input[id*="Zip" i]'), creds.postalCode || '00000');
  fillSelect(q('select[id*="Country" i]', 'select[name*="Country" i]'), creds.country || 'Saudi Arabia');
  await sleep(100);
  setVal(q('input[type="email"]', 'input[placeholder="Email Address"]', 'input[id*="Email" i]', 'input[name*="Email" i]'), creds.email);

  // Blur all to trigger validators
  [...document.querySelectorAll('input,select')].forEach(el => { if (el.offsetParent) blurEl(el); });

  await sleep(300); // Turbo: reduced from 2000
  status('Step 3: Submitting…');
  clickContinue();
  // BUG FIX: only ONE clickContinue here — MutationObserver picks up Step 4
}

// ── STEP 4 — Confirm Policy ───────────────────────────────────────────────────
async function fillStep4(creds) {
  status('Step 4: Confirm Policy…');
  await sleep(600);

  // Check "I AGREE" checkbox
  const agreeChk = q(
    'input[type="checkbox"][id*="Agree" i]',
    'input[type="checkbox"][id*="agree" i]',
    'input[type="checkbox"]'
  );
  if (agreeChk && !agreeChk.checked) {
    agreeChk.click();
    agreeChk.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
  }

  // BUG FIX: find "I Consent" by checking the label/closest text ONLY for that radio
  const allRadios = [...document.querySelectorAll('input[type="radio"]')];
  const consentRadio = allRadios.find(r => {
    // Check label element associated with this radio only
    const labelText = (
      r.closest('label')?.textContent ||
      (r.id ? document.querySelector(`label[for="${r.id}"]`)?.textContent : '') ||
      r.labels?.[0]?.textContent ||
      r.nextElementSibling?.textContent ||
      r.nextSibling?.textContent ||
      ''
    ).trim().toLowerCase();
    return labelText === 'i consent' || labelText.startsWith('i consent');
  });
  if (consentRadio && !consentRadio.checked) {
    consentRadio.click();
    consentRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(50);
  }

  await sleep(300); // Turbo: reduced from 2000
  status('Step 4: Submitting…');
  clickContinue();
  // Do NOT send stepDone here. Wait for page reload to the Dashboard.
}

// ── FINAL STEP — Dashboard ────────────────────────────────────────────────────
async function handleDashboard(creds) {
  // If we already showed it, don't do it again
  if (document.getElementById('__prom_card')) return;

  status('✅ Registration Complete!');

  const user    = creds.finalUsername || creds.username;
  const isBatch = window.__isBatch;

  // ── Overlay ──────────────────────────────────────────────────────────────────
  const card = document.createElement('div');
  card.id = '__prom_card';
  card.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483646;display:flex;align-items:center;justify-content:center';

  // ── Box — wider & taller ────────────────────────────────────────────────────
  const box = document.createElement('div');
  box.style.cssText = [
    'background:#0d1117',
    'border:2px solid #3fb950',
    'border-radius:16px',
    'padding:32px 36px',
    'min-width:440px',
    'max-width:540px',
    'width:92vw',
    'font-family:sans-serif',
    'color:#e6edf3',
    'box-shadow:0 12px 48px rgba(0,0,0,.65)'
  ].join(';');

  const btnLabel = isBatch ? '📋 Copy & Continue' : '📋 Copy & Finish';

  box.innerHTML = `
    <div style="color:#3fb950;font-size:26px;font-weight:800;margin-bottom:22px;text-align:center;letter-spacing:-.3px">
      ✅ Registration Complete!
    </div>

    <div style="background:#161b22;border-radius:10px;padding:16px 18px;margin-bottom:12px">
      <div style="color:#7d8590;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Name</div>
      <div style="font-weight:700;font-size:15px">${creds.firstName} ${creds.lastName}</div>
    </div>

    <div style="background:#161b22;border-radius:10px;padding:16px 18px;margin-bottom:12px">
      <div style="color:#7d8590;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Username</div>
      <div style="font-weight:700;color:#3fb950;font-family:monospace;font-size:16px;word-break:break-all">${user}</div>
    </div>

    <div style="background:#161b22;border-radius:10px;padding:16px 18px;margin-bottom:26px">
      <div style="color:#7d8590;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Password</div>
      <div style="font-weight:700;font-family:monospace;font-size:16px">${creds.password}</div>
    </div>

    <button id="__prom_action"
      style="width:100%;padding:15px;background:#2ea043;border:none;color:#fff;
             border-radius:10px;cursor:pointer;font-weight:800;font-size:15px;
             letter-spacing:.3px;transition:background .15s,transform .1s">
      ${btnLabel}
    </button>
    <div id="__prom_done_msg"
      style="margin-top:10px;text-align:center;font-size:12px;color:#7d8590;display:none">
      ✓ Copied — ${isBatch ? 'signing out…' : 'finishing…'}
    </div>
  `;

  card.appendChild(box);
  document.body.appendChild(card);

  // Hover / press micro-animations
  const actionBtn = document.getElementById('__prom_action');
  actionBtn.addEventListener('mouseenter', () => actionBtn.style.background = '#3fb950');
  actionBtn.addEventListener('mouseleave', () => actionBtn.style.background = '#2ea043');
  actionBtn.addEventListener('mousedown',  () => actionBtn.style.transform  = 'scale(.98)');
  actionBtn.addEventListener('mouseup',    () => actionBtn.style.transform  = 'scale(1)');

  function doSignOut() {
    status('Signing out…');
    const signOut = [...document.querySelectorAll('a,span,div,button')]
      .find(e => (e.textContent||'').trim() === 'Sign Out' && e.tagName !== 'SCRIPT');
    if (signOut) signOut.click();
    else window.location.href = LOGIN_URL;
  }

  actionBtn.addEventListener('click', async () => {
    // 1. Prevent double-click
    actionBtn.disabled = true;
    actionBtn.style.background = '#238636';
    actionBtn.textContent = '✓ Copied!';
    document.getElementById('__prom_done_msg').style.display = 'block';

    // 2. Copy credentials to clipboard
    copyText(`${user}\t${creds.password}`, `${user} / ${creds.password}`);

    // 3. Notify background (resume batch if needed, log history)
    if (isBatch) send('resumeBatch');
    send('stepDone', {
      finalUsername: user,
      password:      creds.password,
      name:          creds.firstName + ' ' + creds.lastName,
      email:         creds.email
    });

    // 4. Brief visual pause, then close overlay + sign out
    await sleep(900);
    card.remove();
    if (isBatch) doSignOut();
  });

  if (AUTO_SUBMIT) {
    status('Auto-continuing in 2s…');
    setTimeout(() => actionBtn.click(), 2000);
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
async function handleInvalidHostHeader() {
  if (document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r, { once: true }));
  await sleep(300);
  window.location.href = LOGIN_URL;
}

async function handleLoginPage() {
  if (document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r, { once: true }));
  await sleep(500);
  const link = [...document.querySelectorAll('a,button,input[type=submit]')]
    .find(el => { const t = (el.textContent || el.value || '').toLowerCase(); return t.includes('register') || t.includes('new user') || t.includes('first time'); });
  if (link) link.click();
  else window.location.href = REGISTER_URL;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
let filledStep = null;
let filling = false;
let currentItem = null;
let observer = null;

async function handleStep(step) {
  if (filling || step === filledStep) return;
  if (!currentItem) { status('⚠️ No data', '#d73a49'); return; }
  if (!GLOBAL_RUNNING && !GLOBAL_SINGLE) {
    status('Paused/Stopped', '#6e7681');
    return;
  }
  filling = true;
  filledStep = step;
  await sleep(PAGE_DELAY);
  if (!GLOBAL_RUNNING && !GLOBAL_SINGLE) { filling = false; return; }
  try {
    if (step === 'dashboard') await handleDashboard(currentItem);
    else if (step === 'policy') await fillStep4(currentItem);
    else if (step === 'profile') await fillStep3(currentItem);
    else if (step === 'signin') await fillStep2(currentItem);
    else if (step === 'prometric') await fillStep1();
  } catch (e) {
    status('❌ ' + e.message, '#d73a49');
    console.error('[Prometric]', e);
  }
  filling = false;

  // BUG FIX: disconnect observer after policy (last step)
  if (step === 'policy' && observer) {
    observer.disconnect();
    observer = null;
  }
}

async function run() {
  const url = window.location.href;

  // Wait for state from bridge.js
  const state = await new Promise(resolve => {
    window.addEventListener('__prom_init', e => resolve(e.detail), { once: true });
    setTimeout(() => resolve(null), 1500);
  });

  // If extension is not explicitly running, do NOTHING.
  if (!state || (!state.isRunning && !state.singleRunning)) {
    return;
  }

  window.__isBatch = state.isRunning;
  GLOBAL_RUNNING = state.isRunning;
  GLOBAL_SINGLE = state.singleRunning;
  status('Active…', '#0969da');
  currentItem = state.currentItem;

  if (url.includes('InvalidHostHeader')) { await handleInvalidHostHeader(); return; }
  if (url.includes('Login.aspx')) { await handleLoginPage(); return; }

  if (document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r, { once: true }));
  await sleep(800);

  if (!currentItem) { status('⚠️ No active data', '#d73a49'); return; }

  let step = null;
  for (let i = 0; i < 20; i++) { step = detectStep(); if (step) break; await sleep(150); }
  if (step) await handleStep(step);

  // Watch for UpdatePanel (AJAX) step changes
  observer = new MutationObserver(async () => {
    if (filling) return;
    const s = detectStep();
    if (s && s !== filledStep && currentItem) await handleStep(s);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('__prom_init', e => { 
  if (e.detail && e.detail.currentItem) currentItem = e.detail.currentItem; 
  if (e.detail && e.detail.pageDelay) PAGE_DELAY = e.detail.pageDelay * 1000;
  if (e.detail && e.detail.autoSubmit !== undefined) AUTO_SUBMIT = e.detail.autoSubmit;
  if (e.detail && e.detail.defAnswer) DEFAULT_ANSWER = e.detail.defAnswer;
  if (e.detail && e.detail.isRunning !== undefined) GLOBAL_RUNNING = e.detail.isRunning;
  if (e.detail && e.detail.singleRunning !== undefined) GLOBAL_SINGLE = e.detail.singleRunning;
});
run().catch(e => { status('❌ ' + e.message, '#d73a49'); });
