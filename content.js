// content.js - MAIN world
const LOGIN_URL = 'https://tcnet1.prometric.com/Login.aspx?ibt=785937226&ClientNameSingleSite=ibtamea';
const REGISTER_URL = 'https://tcnet1.prometric.com/Registration.aspx';
const sleep = ms => {
  const scaledMs = Math.round(ms * (PAGE_DELAY / 2000));
  return new Promise(r => setTimeout(r, Math.max(10, scaledMs)));
};
const wait = ms => new Promise(r => setTimeout(r, ms));

let PAGE_DELAY = 2000;
let AUTO_SUBMIT = false;
let DEFAULT_ANSWER = 'a';
let GLOBAL_RUNNING = false;
let GLOBAL_SINGLE = false;
let STABILITY_MODE = false;

// -- Status indicator ---
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
      pauseBtn.textContent = 'Pause';
      pauseBtn.style.cssText = 'background:rgba(0,0,0,0.2);border:none;color:#fff;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;font-weight:bold';
      pauseBtn.onclick = () => {
        if (pauseBtn.textContent.includes('Pause')) {
          send('pauseBatch'); pauseBtn.textContent = 'Resume'; pauseBtn.style.background = 'rgba(0,0,0,0.4)';
        } else {
          send('resumeBatch'); pauseBtn.textContent = 'Pause'; pauseBtn.style.background = 'rgba(0,0,0,0.2)';
        }
      };
      el.appendChild(pauseBtn);
    }
    
    // Stop button always available if active
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.style.cssText = 'background:rgba(255,0,0,0.5);border:none;color:#fff;border-radius:4px;cursor:pointer;padding:4px 8px;font-size:11px;font-weight:bold';
    stopBtn.onclick = () => { send('stopBatch'); el.remove(); };
    el.appendChild(stopBtn);

    document.body?.appendChild(el);
  } else {
    el.style.background = color;
  }
  txtEl.textContent = 'Turbo ' + msg;
}

function send(action, payload) {
  window.dispatchEvent(new CustomEvent('__prom_msg', { detail: { action, payload } }));
}

function pageSnippet() {
  return String(document.body?.innerText || document.body?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function failStep(reason, failureKind = 'page', retryable = true) {
  const name = currentItem ? `${currentItem.firstName || ''} ${currentItem.lastName || ''}`.trim() : '';
  status(`Error ${reason}`, '#d73a49');
  send('stepFailed', {
    name,
    reason,
    failureKind,
    retryable,
    url: window.location.href,
    step: detectStep() || '',
    pageSnippet: pageSnippet(),
    queueId: currentItem?._queueId
  });
}

// -- Copy helper: reliable copy + saves to storage for 30s cross-tab access --
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
  // Not opacity:0 - some browsers reject invisible elements for clipboard
  ta.style.cssText = 'position:fixed;top:50%;left:50%;width:2px;height:2px;opacity:0.01;border:none;outline:none;resize:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch(_) {}
  document.body.removeChild(ta);
}

// -- Fill field (native setter + events) ---
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function setVal(el, value) {
  if (!el) return;
  try {
    const setter = (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') || 
                   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'))?.set;
    if (setter) setter.call(el, String(value));
    else el.value = String(value);
  } catch (_) { el.value = String(value); }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

function blurEl(el) {
  if (!el) return;
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

function fillSelect(sel, text) {
  if (!sel) return false;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].text.toLowerCase().includes(text.toLowerCase())) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
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
  const selectors = [
    'input[type="submit"]', 'button', 'input[type="button"]', 'a', 'input[type="image"]', 
    '[role="button"]', '.btn', '.button'
  ];
  const candidates = [...document.querySelectorAll(selectors.join(','))];
  
  // Also check divs/spans that might be styled as buttons or contain the text
  document.querySelectorAll('div, span, b, strong').forEach(el => {
    if (el.childElementCount === 0 && (el.textContent || '').trim().toLowerCase().includes('continue')) {
      candidates.push(el);
    }
  });

  const btn = candidates.find(e => {
    if (!e.offsetParent) return false;
    const val = (e.value || e.textContent || '').trim().toLowerCase();
    return val === 'continue' || val.startsWith('continue') || val === 'next' || val === 'submit' || val.includes('continue');
  });

  if (btn) {
    btn.focus();
    btn.click();
    ['mousedown', 'mouseup', 'click'].forEach(type => {
      try {
        btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      } catch(_) {}
    });
    return true;
  }

  // Fallback: search by ID
  const aspBtn = document.querySelector('input[id*="Continue" i], button[id*="Continue" i], input[id*="Submit" i], button[id*="Submit" i], a[id*="Continue" i]');
  if (aspBtn && aspBtn.offsetParent) {
    aspBtn.focus();
    aspBtn.click();
    return true;
  }
  return false;
}

function nextSuffix(s) {
  if (s === '') return '1';
  const n = parseInt(s, 10);
  if (!isNaN(n)) {
    if (n < 99) return String(n + 1);
    return 'a';
  }
  let res = '';
  let carry = true;
  for (let i = s.length - 1; i >= 0; i--) {
    if (carry) {
      if (s.charCodeAt(i) < 122) {
        res = String.fromCharCode(s.charCodeAt(i) + 1) + res;
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
  if (q('select') && (text.includes('Prometric Info') || text.includes('Test Provider') || text.includes('Test Provider or Program'))) return 'prometric';
  return null;
}

// -- STEP 1 - Prometric Info ---
async function fillStep1() {
  status('Step 1: Selecting IBTA MEA...');
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

// -- STEP 2 - Sign In Info ---
async function fillStep2(creds) {
  status('Step 2: Username...');
  const userEl = await waitFor([
    'input[id*="Username" i]',
    'input[placeholder*="Username" i]',
    'input[name*="Username" i]'
  ]);
  if (!userEl) { failStep('Username field not found', 'missing-field', true); return; }

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
    return false; // no error found -> name is available
  }

  let suffix = '';
  while (true) {
    const tryName = creds.username + suffix;
    status(`Trying username: ${tryName}`);

    // -- Step 1: Query the field fresh every iteration ---
    function getField() {
      return document.querySelector('input[id*="Username" i]') ||
             document.querySelector('input[placeholder*="Username" i]') ||
             document.querySelector('input[name*="Username" i]') ||
             userEl;
    }

    // -- Step 2: Clear the field ---
    let el = getField();
    el.focus();
    el.select();
    setVal(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);

    // -- Step 3: Wait until error disappears (UpdatePanel will refresh DOM) ---
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

    // -- Step 4: Re-query AFTER UpdatePanel may have replaced the element ---
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

    // -- Step 5: Verify value actually appears in the field ---
    for (let attempt = 0; attempt < 3; attempt++) {
      const checkEl = getField();
      if (checkEl.value === tryName) break;
      
      checkEl.focus();
      checkEl.select();
      if (nativeSetter) nativeSetter.call(checkEl, tryName);
      else checkEl.value = tryName;
      checkEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: tryName, inputType: 'insertText' }));
      checkEl.dispatchEvent(new Event('change', { bubbles: true }));
      checkEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      checkEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      await sleep(200);
    }

    blurEl(getField());

    // -- Step 6: Wait for server validation (dynamic, up to 4s) ---
    const taken = await waitForUsernameValidation(3000);

    if (!taken) {
      creds.finalUsername = tryName;
      send('updateItem', creds);
      status('Username OK');
      break;
    }
    status(`Warning "${tryName}" taken, trying next...`, '#d29922');
    const next = nextSuffix(suffix);
    if (!next) { failStep('Username exhausted', 'validation', false); return; }
    suffix = next;
  }

  // Password (first 2 password inputs)
  status('Step 2: Password...');
  const pwAll = [...document.querySelectorAll('input[type="password"]')];
  for (let i = 0; i < Math.min(pwAll.length, 2); i++) {
    pwAll[i].focus();
    setVal(pwAll[i], creds.password);
    await sleep(10); // Turbo: reduced from 80
  }

  // Security questions: trigger dropdown then fill text inputs
  status('Step 2: Security questions...');
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
  status('Step 2: Submitting...');
  clickContinue();
  // No second click here - MutationObserver handles next step
}

// -- STEP 3 - Profile Info ---
async function fillStep3(creds) {
  status('Step 3: Profile Info...');
  const fnEl = await waitFor([
    'input[placeholder="First Name"]',
    'input[id*="FirstName" i]',
    'input[name*="FirstName" i]'
  ]);
  if (!fnEl) { failStep('First Name field not found', 'missing-field', true); return; }

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
  status('Step 3: Submitting...');
  clickContinue();
  // BUG FIX: only ONE clickContinue here - MutationObserver picks up Step 4
}

// -- STEP 4 - Confirm Policy ---
async function fillStep4(creds) {
  status('Step 4: Confirm Policy...');

  async function ensureSelected() {
    const agreeChk = q(
      'input[type="checkbox"][id*="Agree" i]',
      'input[type="checkbox"][id*="agree" i]',
      'input[type="checkbox"]'
    );
    if (agreeChk && !agreeChk.checked) {
      agreeChk.click();
      agreeChk.dispatchEvent(new Event('change', { bubbles: true }));
      agreeChk.dispatchEvent(new Event('input', { bubbles: true }));
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
      consentRadio.dispatchEvent(new Event('change', { bubbles: true }));
      consentRadio.dispatchEvent(new Event('input', { bubbles: true }));
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
      const style = window.getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.pointerEvents !== 'none';
    });
  }

  function clickReadyContinue(btn) {
    btn.focus();
    btn.click();
    ['mousedown', 'mouseup', 'click'].forEach(type => {
      try {
        btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      } catch (_) {}
    });
  }

  const deadline = Date.now() + (STABILITY_MODE ? 60000 : 30000);
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts++;
    status(`Step 4: Waiting for Continue...`);
    await ensureSelected();

    const btn = findReadyContinue();
    if (btn) {
      status(`Step 4: Continue found, submitting...`);
      clickReadyContinue(btn);
      await wait(2500);
      if (detectStep() !== 'policy') return; 
      if (attempts % 4 === 0) {
        status('Step 4: Still on policy, retrying...', '#d29922');
      }
    }

    await wait(400);
  }
  
  failStep('Continue did not become ready on Step 4', 'timeout', true);
}

// -- FINAL STEP - Dashboard ---
async function handleDashboard(creds) {
  // If we already showed it, don't do it again
  if (document.getElementById('__prom_card')) return;

  status('OK Registration Complete!');

  const user    = creds.finalUsername || creds.username;
  const isBatch = window.__isBatch;

  // -- Overlay ---
  const card = document.createElement('div');
  card.id = '__prom_card';
  card.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483646;display:flex;align-items:center;justify-content:center';

  // -- Box - wider & taller ---
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

  const btnLabel = isBatch ? 'Copy & Continue' : 'Copy & Finish';

  box.innerHTML = `
    <div style="color:#3fb950;font-size:26px;font-weight:800;margin-bottom:22px;text-align:center;letter-spacing:-.3px">
      OK Registration Complete!
    </div>

    <div style="background:#161b22;border-radius:10px;padding:16px 18px;margin-bottom:12px">
      <div style="color:#7d8590;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Name</div>
      <div style="font-weight:700;font-size:15px">${escapeHtml(creds.firstName)} ${escapeHtml(creds.lastName)}</div>
    </div>

    <div style="background:#161b22;border-radius:10px;padding:16px 18px;margin-bottom:12px">
      <div style="color:#7d8590;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Username</div>
      <div style="font-weight:700;color:#3fb950;font-family:monospace;font-size:16px;word-break:break-all">${escapeHtml(user)}</div>
    </div>

    <div style="background:#161b22;border-radius:10px;padding:16px 18px;margin-bottom:26px">
      <div style="color:#7d8590;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Password</div>
      <div style="font-weight:700;font-family:monospace;font-size:16px">${escapeHtml(creds.password)}</div>
    </div>

    <button id="__prom_action"
      style="width:100%;padding:15px;background:#2ea043;border:none;color:#fff;
             border-radius:10px;cursor:pointer;font-weight:800;font-size:15px;
             letter-spacing:.3px;transition:background .15s,transform .1s">
      ${btnLabel}
    </button>
    <div id="__prom_done_msg"
      style="margin-top:10px;text-align:center;font-size:12px;color:#7d8590;display:none">
      OK Copied - ${isBatch ? 'signing out...' : 'finishing...'}
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
    status('Signing out...');
    const signOut = [...document.querySelectorAll('a,span,div,button')]
      .find(e => (e.textContent||'').trim() === 'Sign Out' && e.tagName !== 'SCRIPT');
    if (signOut) signOut.click();
    else window.location.href = LOGIN_URL;
  }

  actionBtn.addEventListener('click', async () => {
    // 1. Prevent double-click
    actionBtn.disabled = true;
    actionBtn.style.background = '#238636';
    actionBtn.textContent = 'OK Copied!';
    document.getElementById('__prom_done_msg').style.display = 'block';

    // 2. Copy credentials to clipboard
    copyText(`${user}\t${creds.password}`, `${user} / ${creds.password}`);

    // 3. Brief visual pause, then close overlay + sign out
    await sleep(900);
    card.remove();
    if (isBatch) {
      doSignOut();
      await sleep(500); // small buffer for sign-out to initiate
    }

    // 4. Notify background - triggers openNextTab() internally after userDelay
    send('stepDone', {
      finalUsername: user,
      password:      creds.password,
      name:          creds.firstName + ' ' + creds.lastName,
      email:         creds.email,
      url:           window.location.href,
      step:          detectStep() || 'dashboard',
      queueId:       creds._queueId
    });
  });

  if (AUTO_SUBMIT || isBatch) {
    status('Auto-continuing in 2s...');
    setTimeout(() => actionBtn.click(), 2000);
  }
}

// -- Navigation ---
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
  
  if (hasError) {
    if (filledStep === step) filledStep = null; // Allow retry
  }

  if (filling || step === filledStep) return;
  if (!currentItem) { status('Warning No data', '#d73a49'); return; }
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
    failStep(e.message || 'Unhandled content error', 'exception', true);
    console.error('[Prometric]', e);
  }
  filling = false;

  // If we are on policy step, allow retrying after a while if we're still here
  if (step === 'policy') {
    setTimeout(() => {
      if (detectStep() === 'policy') filledStep = null;
    }, 4000);
  }
}

async function run() {
  const url = window.location.href;

  // Wait for state from bridge.js
  const state = await new Promise(resolve => {
    window.addEventListener('__prom_init', e => resolve(e.detail), { once: true });
    window.dispatchEvent(new CustomEvent('__prom_ready'));
    setTimeout(() => resolve(null), 1500);
  });

  // If extension is not explicitly running, do NOTHING.
  if (!state || (!state.isRunning && !state.singleRunning)) {
    return;
  }

  window.__isBatch = state.isRunning;
  GLOBAL_RUNNING = state.isRunning;
  GLOBAL_SINGLE = state.singleRunning;
  status('Active...', '#0969da');
  currentItem = state.currentItem;

  if (url.includes('InvalidHostHeader')) { await handleInvalidHostHeader(); return; }
  if (url.includes('Login.aspx')) { await handleLoginPage(); return; }

  if (document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r, { once: true }));
  await sleep(800);

  if (!currentItem) { failStep('No active data for page', 'state', true); return; }

  let step = null;
  for (let i = 0; i < 20; i++) { step = detectStep(); if (step) break; await sleep(150); }
  if (step) await handleStep(step);
  else failStep('Could not detect registration step', 'page', true);

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
  if (e.detail && e.detail.pageDelay !== undefined) PAGE_DELAY = e.detail.pageDelay * 1000;
  if (e.detail && e.detail.autoSubmit !== undefined) AUTO_SUBMIT = e.detail.autoSubmit;
  if (e.detail && e.detail.stabilityMode !== undefined) STABILITY_MODE = e.detail.stabilityMode;
  if (e.detail && e.detail.defAnswer !== undefined) DEFAULT_ANSWER = e.detail.defAnswer;
  if (e.detail && e.detail.isRunning !== undefined) GLOBAL_RUNNING = e.detail.isRunning;
  if (e.detail && e.detail.singleRunning !== undefined) GLOBAL_SINGLE = e.detail.singleRunning;
});
run().catch(e => { status('Error ' + e.message, '#d73a49'); });
