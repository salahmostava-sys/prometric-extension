// bridge.js — runs in ISOLATED world
// Handles chrome APIs and passes data to/from MAIN world content.js

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Send currentItem to MAIN world
async function sendDataToPage() {
  const { currentItem, isRunning, singleRunning, pageDelay, autoSubmit, defAnswer, queue, queueIndex } = await chrome.storage.local.get(['currentItem', 'isRunning', 'singleRunning', 'pageDelay', 'autoSubmit', 'defAnswer', 'queue', 'queueIndex']);
  const isLast = isRunning && queue && queueIndex === queue.length - 1;
  window.dispatchEvent(new CustomEvent('__prom_init', {
    detail: { 
      currentItem: currentItem || null, 
      isRunning, 
      singleRunning,
      isLast,
      pageDelay: pageDelay || 2,
      autoSubmit: autoSubmit || false,
      defAnswer: defAnswer || 'a'
    }
  }));
}

// ── Messages from MAIN world ──────────────────────────────────────────────────
window.addEventListener('__prom_msg', (e) => {
  if (e.detail.action === 'stepDone') {
    chrome.runtime.sendMessage({ action: 'stepDone', data: e.detail.data });
  }
  if (e.detail.action === 'stepFailed') {
    chrome.runtime.sendMessage({ action: 'stepFailed', error: e.detail.error });
  }
  if (e.detail.action === 'resumeBatch') {
    chrome.runtime.sendMessage({ action: 'resumeBatch' });
  }
  if (e.detail.action === 'saveCopied') {
    chrome.storage.local.set({ copiedCreds: e.detail.data });
  }
});

// ── Retry State (Persists across reloads) ────────────────────────────────────
window.addEventListener('__prom_get_retry', async (e) => {
  const { retryCount = 0 } = await chrome.storage.local.get(['retryCount']);
  if (e.detail.callback) e.detail.callback({ retryCount });
});

window.addEventListener('__prom_set_retry', async (e) => {
  await chrome.storage.local.set({ retryCount: e.detail.count });
});

window.addEventListener('__prom_reset_retry', async () => {
  await chrome.storage.local.set({ retryCount: 0 });
});

// Send data when page loads
sendDataToPage();

// Also re-send if storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.currentItem || changes.isRunning || changes.singleRunning || changes.pageDelay || changes.autoSubmit || changes.defAnswer) {
    sendDataToPage();
  }
});
