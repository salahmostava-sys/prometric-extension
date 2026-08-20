// dom-utils.js - Shared DOM manipulation utilities
/* exported setVal, blurEl, fillSelect, selectCountry, findCountrySelect, querySelectorAny, clickContinue */

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

function normalizeMatchText(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Strip Arabic diacritics (tashkeel)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const KNOWN_COUNTRY_ALIASES = {
  saudi: [
    'saudi arabia',
    'saudi',
    'ksa',
    'sau',
    'sa',
    'kingdom of saudi arabia',
    'saudi arabia kingdom of',
    'السعودية',
    'المملكة العربية السعودية',
    'المملكه العربيه السعوديه',
    'المملكة',
    'المملكه',
    'سعودية',
    'سعوديه'
  ],
  egypt: [
    'egypt',
    'eg',
    'egy',
    'مصر',
    'جمهورية مصر العربية',
    'جمهوريه مصر العربيه'
  ],
  uae: [
    'united arab emirates',
    'uae',
    'ae',
    'are',
    'الامارات',
    'الإمارات',
    'الامارات العربية المتحدة',
    'الامارات العربيه المتحده'
  ],
  kuwait: ['kuwait', 'kw', 'kwt', 'الكويت'],
  bahrain: ['bahrain', 'bh', 'bhr', 'البحرين'],
  qatar: ['qatar', 'qa', 'qat', 'قطر'],
  oman: ['oman', 'om', 'omn', 'عمان', 'سلطنة عمان', 'سلطنه عمان'],
  jordan: ['jordan', 'jo', 'jor', 'الاردن', 'الأردن']
};

function getCountryAliases(countryInput) {
  const norm = normalizeMatchText(countryInput);
  if (!norm) return ['saudi arabia', 'saudi', 'ksa', 'sau', 'sa', 'السعودية'];

  for (const group of Object.values(KNOWN_COUNTRY_ALIASES)) {
    const isGroupMatch = group.some(alias => {
      const normAlias = normalizeMatchText(alias);
      return norm === normAlias || norm.includes(normAlias) || normAlias.includes(norm);
    });
    if (isGroupMatch) {
      const merged = [norm, ...group.map(normalizeMatchText)];
      return [...new Set(merged.filter(Boolean))];
    }
  }

  return [norm];
}

function findMatchingOptionIndex(sel, searchTerms) {
  if (!sel || !sel.options || sel.options.length === 0) return -1;
  const terms = searchTerms.map(normalizeMatchText).filter(Boolean);
  if (terms.length === 0) return -1;

  const optionData = Array.from(sel.options).map((opt, index) => ({
    index,
    rawText: opt.text || '',
    normText: normalizeMatchText(opt.text),
    normValue: normalizeMatchText(opt.value)
  }));

  // Priority 1: Exact match on normalized text or value
  for (const term of terms) {
    const match = optionData.find(o => o.normText === term || o.normValue === term);
    if (match) return match.index;
  }

  // Priority 2: Option text starts with term or term starts with option text
  for (const term of terms) {
    const match = optionData.find(o =>
      (o.normText && o.normText.startsWith(term)) ||
      (o.normText && term.startsWith(o.normText) && o.normText.length > 2)
    );
    if (match) return match.index;
  }

  // Priority 3: Substring match (either text contains term or term contains text)
  for (const term of terms) {
    const match = optionData.find(o =>
      (o.normText && o.normText.includes(term)) ||
      (term.length > 3 && o.normText && term.includes(o.normText) && o.normText.length > 2) ||
      (o.normValue && (o.normValue === term || o.normValue.includes(term)))
    );
    if (match) return match.index;
  }

  // Priority 4: Word overlap (e.g. 'saudi' word in option text)
  for (const term of terms) {
    const termWords = term.split(' ').filter(w => w.length >= 3);
    for (const word of termWords) {
      const match = optionData.find(o => o.normText.split(' ').includes(word));
      if (match) return match.index;
    }
  }

  return -1;
}

function fillSelect(sel, textOrAliases) {
  if (!sel) return false;
  const searchTerms = Array.isArray(textOrAliases) ? textOrAliases : [textOrAliases];
  const matchIndex = findMatchingOptionIndex(sel, searchTerms);
  if (matchIndex < 0) return false;

  const targetOption = sel.options[matchIndex];
  sel.selectedIndex = matchIndex;
  targetOption.selected = true;

  try {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(sel, targetOption.value);
    else sel.value = targetOption.value;
  } catch (_) {
    sel.value = targetOption.value;
  }

  triggerEvents(sel, ['input', 'change']);
  if (typeof sel.onchange === 'function') {
    try { sel.onchange(); } catch (_) {}
  }
  if (typeof sel.oninput === 'function') {
    try { sel.oninput(); } catch (_) {}
  }

  return true;
}

function selectCountry(sel, targetCountry) {
  if (!sel) return false;
  const aliases = getCountryAliases(targetCountry || 'Saudi Arabia');
  return fillSelect(sel, aliases);
}

function findCountrySelect() {
  const direct = querySelectorAny(
    'select[id*="Country" i]',
    'select[name*="Country" i]',
    'select[id*="cntry" i]',
    'select[name*="cntry" i]',
    'select[id*="nation" i]',
    'select[name*="nation" i]',
    'select[id*="cboCountry" i]',
    'select[id*="ddlCountry" i]',
    'select[aria-label*="country" i]',
    'select[aria-label*="البلد" i]',
    'select[aria-label*="الدولة" i]',
    'select[data-field*="country" i]'
  );
  if (direct) return direct;

  // Search by label text association
  const labels = Array.from(document.querySelectorAll('label'));
  for (const label of labels) {
    const labelText = (label.textContent || '').trim().toLowerCase();
    if (labelText.includes('country') || labelText.includes('البلد') || labelText.includes('الدولة') || labelText.includes('nation')) {
      if (label.htmlFor) {
        const linked = document.getElementById(label.htmlFor);
        if (linked && linked.tagName === 'SELECT') return linked;
      }
      const nested = label.querySelector('select');
      if (nested) return nested;
      const parentSelect = label.parentElement?.querySelector('select');
      if (parentSelect) return parentSelect;
    }
  }

  // Fallback: check all select elements on the page for country options
  const allSelects = Array.from(document.querySelectorAll('select'));
  for (const s of allSelects) {
    const text = (s.textContent || '').toLowerCase();
    if (text.includes('saudi') || text.includes('united states') || text.includes('afghanistan')) {
      return s;
    }
  }

  // Single select fallback if only one select exists on the form
  if (allSelects.length === 1 && allSelects[0].offsetParent !== null) {
    return allSelects[0];
  }

  return null;
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

// ─── Test Exports (Node.js / Jest only) ──────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    triggerEvents,
    setVal,
    blurEl,
    normalizeMatchText,
    getCountryAliases,
    findMatchingOptionIndex,
    fillSelect,
    selectCountry,
    findCountrySelect,
    forceClick,
    querySelectorAny,
    clickContinue
  };
}

