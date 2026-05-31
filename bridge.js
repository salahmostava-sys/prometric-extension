// bridge.js - runs in ISOLATED world
// Handles chrome APIs and passes data to/from MAIN world content.js

const DEFAULT_PAGE_DELAY = 1;
const DEFAULT_ANSWER = 'a';

// Send currentItem to MAIN world
async function sendDataToPage() {
  const { currentItem, isRunning, singleRunning, pageDelay, autoSubmit, defAnswer, stabilityMode, queue, queueIndex } = await chrome.storage.local.get(['currentItem', 'isRunning', 'singleRunning', 'pageDelay', 'autoSubmit', 'defAnswer', 'stabilityMode', 'queue', 'queueIndex']);
  const isLast = isRunning && queue && queueIndex >= queue.length - 1;
  window.dispatchEvent(new CustomEvent('__prom_init', {
    detail: { 
      currentItem: currentItem || null, 
      isRunning, 
      singleRunning,
      isLast,
      pageDelay: pageDelay ?? DEFAULT_PAGE_DELAY,
      autoSubmit: autoSubmit ?? false,
      stabilityMode: stabilityMode ?? false,
      defAnswer: defAnswer ?? DEFAULT_ANSWER
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
      email:         payload?.email         || '',
      url:           payload?.url           || '',
      step:          payload?.step          || '',
      queueId:       payload?.queueId       || ''
    });
  }

  if (action === 'stepFailed') {
    await sendToBackground({
      action: 'stepFailed',
      name:        payload?.name        || '',
      reason:      payload?.reason      || '',
      failureKind: payload?.failureKind || '',
      retryable:   payload?.retryable,
      url:         payload?.url         || '',
      step:        payload?.step        || '',
      pageSnippet: payload?.pageSnippet || '',
      queueId:     payload?.queueId     || ''
    });
  }

  if (action === 'updateItem') {
    await chrome.storage.local.set({ currentItem: payload });
  }

  if (action === 'pauseBatch') {
    // FIX #1: Only pause batch (isRunning), never touch singleRunning.
    // Sending 'stopQueue' to background also resets singleRunning, which is wrong.
    await chrome.storage.local.set({ isRunning: false });
  }
  if (action === 'resumeBatch') {
    await chrome.storage.local.set({ isRunning: true });
    await sendToBackground({ action: 'resumeQueue' });
  }
  if (action === 'stopBatch') {
    await chrome.storage.local.set({ isRunning: false, singleRunning: false });
    await sendToBackground({ action: 'stopQueue' });
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

// Send data when page loads. MAIN world may not have attached its listener yet,
// so also respond to an explicit ready signal and do a couple of short retries.
sendDataToPage();
setTimeout(sendDataToPage, 250);
setTimeout(sendDataToPage, 1000);

window.addEventListener('__prom_ready', () => {
  sendDataToPage();
});

// Also re-send if storage changes (for future items in batch)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.currentItem || changes.isRunning || changes.singleRunning || changes.pageDelay || changes.autoSubmit || changes.defAnswer || changes.stabilityMode) {
    // FIX #8: Include queue and queueIndex so isLast stays fresh
    chrome.storage.local.get(['isRunning', 'singleRunning', 'currentItem', 'pageDelay', 'autoSubmit', 'defAnswer', 'stabilityMode', 'queue', 'queueIndex']).then(state => {
      const isLast = state.isRunning && state.queue && state.queueIndex >= state.queue.length - 1;
      window.dispatchEvent(new CustomEvent('__prom_init', {
        detail: { 
          currentItem: state.currentItem || null, 
          isRunning: state.isRunning, 
          singleRunning: state.singleRunning,
          isLast,
          pageDelay: state.pageDelay ?? DEFAULT_PAGE_DELAY,
          autoSubmit: state.autoSubmit ?? false,
          stabilityMode: state.stabilityMode ?? false,
          defAnswer: state.defAnswer ?? DEFAULT_ANSWER
        }
      }));
    });
  }
});
