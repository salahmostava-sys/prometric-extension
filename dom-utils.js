// dom-utils.js - Shared DOM manipulation utilities
/* exported setVal, blurEl, fillSelect, querySelectorAny, clickContinue */

function triggerEvents(el, eventTypes) {
  for (const type of eventTypes) {
    if (type === 'keydown' || type === 'keyup') {
      el.dispatchEvent(new KeyboardEvent(type, { bubbles: true }));
    } else {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    }
  }
}

function setVal(el, value) {
  if (!el) return;
  try {
    const setter = (Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'))?.set;
    if (setter) setter.call(el, String(value));
    else el.value = String(value);
  } catch (_) { el.value = String(value); }
  triggerEvents(el, ['input', 'change', 'keydown', 'keyup']);
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
      triggerEvents(sel, ['change']);
      return true;
    }
  }
  return false;
}

function querySelectorAny(...sels) {
  for (const s of sels) {
    const e = document.querySelector(s);
    if (e) return e;
  }
  return null;
}

function forceClick(btn) {
  btn.focus();
  btn.click();
  ['mousedown', 'mouseup', 'click'].forEach(type => {
    try {
      btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: globalThis }));
    } catch(err) {
      // Ignore simulated event dispatch errors as native click() already fired
    }
  });
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

  const continueButton = candidates.find(candidateEl => {
    if (!candidateEl.offsetParent) return false;
    const val = (candidateEl.value || candidateEl.textContent || '').trim().toLowerCase();
    return val === 'continue' || val.startsWith('continue') || val === 'next' || val === 'submit' || val.includes('continue');
  });

  if (continueButton) {
    forceClick(continueButton);
    return true;
  }

  // Fallback: search by ID
  const aspBtn = document.querySelector('input[id*="Continue" i], button[id*="Continue" i], input[id*="Submit" i], button[id*="Submit" i], a[id*="Continue" i]');
  if (aspBtn?.offsetParent) {
    forceClick(aspBtn);
    return true;
  }
  return false;
}
