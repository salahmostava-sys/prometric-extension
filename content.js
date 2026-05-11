// content.js — runs in MAIN world
// Handles DOM automation

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOGIN_URL = 'https://tcnet1.prometric.com/Candidates/Candidate/Main.aspx';

let currentItem = null;
let PAGE_DELAY = 1000;
let AUTO_SUBMIT = false;
let DEFAULT_ANSWER = 'a';
let GLOBAL_RUNNING = false;
let GLOBAL_SINGLE = false;

// ── Status indicator ──────────────────────────────────────────────────────────
function status(msg, color = '#2ea043') {
  let el = document.getElementById('__prom_status');
  if (!el) {
    el = document.createElement('div');
    el.id = '__prom_status';
    el.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;padding:12px 20px;background:#161b22;color:#fff;border-radius:8px;font-weight:700;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid #30363d;transition:all 0.3s';
    document.body.appendChild(el);
  }
  el.textContent = '⚡ ' + msg;
  el.style.borderColor = color;
}

function send(action, data) {
  window.dispatchEvent(new CustomEvent('__prom_msg', { detail: { action, data } }));
}

// ── Form Helpers ──────────────────────────────────────────────────────────────
function setVal(el, val) {
  if (!el) return;
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function clickContinue() {
  const btn = [...document.querySelectorAll('input[type="submit"], button')].find(b => {
    const t = (b.value || b.textContent || '').toLowerCase();
    return t.includes('continue') || t.includes('submit') || t.includes('save') || t.includes('next');
  });
  if (btn) btn.click();
}

function fillSelect(sel, value) {
  if (!sel) return;
  const opt = [...sel.options].find(o => o.text.includes(value) || o.value === value);
  if (opt) {
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function blurEl(el) {
  if (!el) return;
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

// ── Detection Logic ───────────────────────────────────────────────────────────
function detectStep() {
  const url = window.location.href.toLowerCase();
  const text = document.body.innerText.toLowerCase();
  
  if (url.includes('candidate_info.aspx') && document.querySelector('select')) return 'STEP_1_PROGRAM';
  if (text.includes('account information') || document.querySelector('input[id*="Username"]')) return 'STEP_2_ACCOUNT';
  if (text.includes('profile information') || document.querySelector('input[id*="Address"]')) return 'STEP_3_PROFILE';
  if (text.includes('data privacy notice') || text.includes('privacy policy')) return 'STEP_4_POLICY';
  if (url.includes('main.aspx') || text.includes('candidate dashboard')) return 'DASHBOARD';
  return null;
}

// ── Automation Steps ──────────────────────────────────────────────────────────
async function handleStep1() {
  status('Step 1: Selecting IBTA MEA…');
  const sel = await waitFor(['select']);
  if (!sel) return;
  await sleep(100);
  fillSelect(sel, 'IBTA MEA');
  await sleep(300);
  clickContinue();
}

async function waitForUsernameValidation(maxMs = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(150);
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
    const style = window.getComputedStyle(document.querySelector('input[id*="Username"]'));
    const borderColor = style.borderColor || style.border || '';
    if (borderColor.includes('255, 0') || borderColor.includes('rgb(255,0')) return true;
  }
  return false;
}

async function handleStep2(creds) {
  status('Step 2: Filling Account Details…');
  const userEl = await waitFor(['input[id*="Username"]']);
  if (!userEl) return;

  let suffix = '';
  while (true) {
    const tryName = creds.username + suffix;
    status(`Trying: ${tryName}…`);
    setVal(userEl, tryName);
    await sleep(100);
    blurEl(userEl);
    
    const taken = await waitForUsernameValidation(3000);
    if (!taken) {
      creds.finalUsername = tryName;
      break;
    }
    suffix = suffix === '' ? '1' : String(parseInt(suffix) + 1);
    if (suffix === '10') break; 
  }

  const pwAll = document.querySelectorAll('input[type="password"]');
  for (let i = 0; i < Math.min(pwAll.length, 2); i++) {
    setVal(pwAll[i], creds.password);
    await sleep(10);
  }

  const textInputs = document.querySelectorAll('input[type="text"]:not([id*="Username"])');
  for (const inp of textInputs) {
    setVal(inp, DEFAULT_ANSWER);
    await sleep(10);
  }

  await sleep(300);
  clickContinue();
}

async function handleStep3(creds) {
  status('Step 3: Profile Information…');
  const addr = await waitFor(['input[id*="Address"]']);
  if (!addr) return;

  const { defAddress, defCity, defState, defPostal, defCountry } = await new Promise(r => {
    chrome.storage.local.get(['defAddress', 'defCity', 'defState', 'defPostal', 'defCountry'], r);
  });

  setVal(addr, defAddress || 'Al-Alameya');
  setVal(document.querySelector('input[id*="City"]'), defCity || 'JEDDAH');
  setVal(document.querySelector('input[id*="State"]'), defState || 'JEDDAH');
  setVal(document.querySelector('input[id*="Zip"]'), defPostal || '00000');
  
  const countrySel = document.querySelector('select[id*="Country"]');
  if (countrySel) fillSelect(countrySel, defCountry || 'Saudi Arabia');
  
  const emailInps = document.querySelectorAll('input[type="email"], input[id*="Email"]');
  for (const e of emailInps) setVal(e, creds.email);

  await sleep(300);
  clickContinue();
}

async function handleStep4() {
  status('Step 4: Privacy Policy…');
  const consentRadio = [...document.querySelectorAll('input[type="radio"]')].find(r => r.id.toLowerCase().includes('consent') || r.value === 'Y');
  if (consentRadio) {
    consentRadio.click();
    await sleep(50);
  }
  await sleep(300);
  clickContinue();
}

async function handleDashboard(creds) {
  status('Success! Finalizing…');
  const isBatch = GLOBAL_RUNNING;
  const user = creds.finalUsername || creds.username;

  const card = document.createElement('div');
  card.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#161b22;border:1px solid #30363d;padding:30px;border-radius:12px;z-index:1000001;width:340px;box-shadow:0 24px 64px rgba(0,0,0,0.8)';
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:20px"><span style="font-size:40px">🎉</span></div>
    <div style="font-weight:800;font-size:18px;text-align:center;margin-bottom:10px">Registration Complete</div>
    <div style="background:#0d1117;padding:15px;border-radius:8px;margin-bottom:20px;border:1px solid #30363d">
      <div style="font-size:11px;color:#7d8590">Username</div>
      <div style="font-weight:700;color:#58a6ff;margin-bottom:8px">${user}</div>
      <div style="font-size:11px;color:#7d8590">Password</div>
      <div style="font-weight:700;color:#d29922">${creds.password}</div>
    </div>
    <button id="__prom_copy" style="width:100%;padding:12px;background:#238636;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">📋 Copy & Finish</button>
  `;
  document.body.appendChild(card);

  document.getElementById('__prom_copy').addEventListener('click', async () => {
    const text = `${user}\t${creds.password}`;
    send('saveCopied', { text, expiresAt: Date.now() + 30000, label: user });
    
    if (isBatch) send('resumeBatch');
    send('stepDone', { finalUsername: user, password: creds.password, email: creds.email });
    
    await sleep(500);
    card.remove();
    const signOut = [...document.querySelectorAll('a')].find(a => a.textContent.includes('Sign Out'));
    if (signOut) signOut.click();
    else window.location.href = LOGIN_URL;
  });

  if (AUTO_SUBMIT) {
    setTimeout(() => document.getElementById('__prom_copy').click(), 2000);
  }
}

// ── Navigation & Resilience ───────────────────────────────────────────────────
async function handleErrorAndRetry() {
  const text = document.body.innerText.toLowerCase();
  const isError = text.includes('server error') || text.includes('404') || text.includes('500') || text.includes('not found');
  
  if (isError || document.body.childElementCount < 2) {
    const retryCount = await new Promise(r => {
      window.dispatchEvent(new CustomEvent('__prom_get_retry', { detail: { callback: r } }));
    });
    
    if (retryCount < 3) {
      status(`Error detected. Retrying (${retryCount + 1}/3)…`, '#d29922');
      window.dispatchEvent(new CustomEvent('__prom_set_retry', { detail: { count: retryCount + 1 } }));
      await sleep(3000);
      location.reload();
      return true;
    } else {
      status('❌ Max retries reached.', '#f85149');
      send('stepFailed', 'Server Error / Page Load Failed');
      return true;
    }
  }
  return false;
}

async function waitFor(selectors) {
  for (let i = 0; i < 40; i++) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.offsetParent) return el;
    }
    await sleep(200);
  }
  return null;
}

let filledStep = null;
async function handleStep(step) {
  if (filledStep === step) return;
  filledStep = step;
  window.dispatchEvent(new CustomEvent('__prom_reset_retry'));

  if (step === 'STEP_1_PROGRAM') await handleStep1();
  if (step === 'STEP_2_ACCOUNT') await handleStep2(currentItem);
  if (step === 'STEP_3_PROFILE') await handleStep3(currentItem);
  if (step === 'STEP_4_POLICY')  await handleStep4();
  if (step === 'DASHBOARD')      await handleDashboard(currentItem);
}

async function run() {
  if (await handleErrorAndRetry()) return;
  
  const step = detectStep();
  if (step && currentItem) {
    await handleStep(step);
  }
  
  new MutationObserver(async () => {
    const s = detectStep();
    if (s && s !== filledStep && currentItem) await handleStep(s);
  }).observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('__prom_init', e => {
  const state = e.detail;
  if (state.currentItem) currentItem = state.currentItem;
  if (state.pageDelay) PAGE_DELAY = state.pageDelay * 1000;
  if (state.autoSubmit !== undefined) AUTO_SUBMIT = state.autoSubmit;
  if (state.isRunning !== undefined) GLOBAL_RUNNING = state.isRunning;
  if (state.singleRunning !== undefined) GLOBAL_SINGLE = state.singleRunning;
});

run().catch(e => { status('❌ ' + e.message, '#f85149'); });
