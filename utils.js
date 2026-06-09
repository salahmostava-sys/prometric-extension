// utils.js - Shared utilities for Prometric Extension

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

/**
 * Generate credentials based on the full name and a password pattern.
 * Does not depend on Chrome API (pattern must be passed in).
 */
function generateCredentials(name, passPattern = '{F}@{f}#$1970') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;
  
  // Clean parts to keep only alphabetical letters for the username
  const cleanedParts = parts.map(p => p.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  const uPart1 = cleanedParts[0] || 'USER';
  const uPart2 = cleanedParts[1] || uPart1;
  const username = (uPart1 + uPart2).toUpperCase();
  
  const F = parts[0][0].toUpperCase();
  const f = F.toLowerCase();
  const L = parts[parts.length-1][0].toUpperCase();
  const l = L.toLowerCase();

  const password = passPattern
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
