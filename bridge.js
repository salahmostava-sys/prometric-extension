// bridge.js - runs in ISOLATED world
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

// Retry once if service worker was sleeping (MV3)
async function sendToBackground(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (e) {
    if (e?.message?.includes('Receiving end does not exist')) {
      await new Promise(r => setTimeout(r, 300));
      try { return await chrome.runtime.sendMessage(payload); } catch (_) {}
    }
  }
}

// Listen for messages FROM MAIN world content.js
window.addEventListener('__prom_msg', async (e) => {
  const { action, payload } = e.detail || {};

  if (action === 'stepDone') {
    await sendToBackground({
      action:        'stepDone',
      finalUsername: payload?.finalUsername || '',
      password:      payload?.password      || '',
      name:          payload?.name          || '',
      email:         payload?.email         || ''
    });
  }

  if (action === 'stepFailed') {
    await sendToBackground({
      action: 'stepFailed',
      name:   payload?.name   || '',
      reason: payload?.reason || ''
    });
  }

  if (action === 'updateItem') {
    await chrome.storage.local.set({ currentItem: payload });
  }

  if (action === 'pauseBatch') {
    await chrome.storage.local.set({ isRunning: false });
  }
  if (action === 'resumeBatch') {
    await chrome.storage.local.set({ isRunning: true });
  }
  if (action === 'stopBatch') {
    await chrome.storage.local.set({ isRunning: false, singleRunning: false });
  }

  // Save copied credentials with expiry for cross-tab access
  if (action === 'saveCopied') {
    await chrome.storage.local.set({ copiedCreds: payload });
    // Auto-clear after 30 seconds
    setTimeout(async () => {
      const { copiedCreds } = await chrome.storage.local.get(['copiedCreds']);
      if (copiedCreds && Date.now() >= copiedCreds.expiresAt) {
        await chrome.storage.local.remove('copiedCreds');
      }
    }, 30000);
  }
});

// Send data when page loads
sendDataToPage();

// Also re-send if storage changes (for future items in batch)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.currentItem || changes.isRunning || changes.singleRunning || changes.pageDelay || changes.autoSubmit || changes.defAnswer) {
    chrome.storage.local.get(['isRunning', 'singleRunning', 'currentItem', 'pageDelay', 'autoSubmit', 'defAnswer']).then(state => {
      window.dispatchEvent(new CustomEvent('__prom_init', {
        detail: { 
          currentItem: state.currentItem || null, 
          isRunning: state.isRunning, 
          singleRunning: state.singleRunning,
          pageDelay: state.pageDelay || 2,
          autoSubmit: state.autoSubmit || false,
          defAnswer: state.defAnswer || 'a'
        }
      }));
    });
  }
});
