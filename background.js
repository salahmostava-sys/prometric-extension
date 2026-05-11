const START_URL = 'https://tcnet1.prometric.com/InvalidHostHeader.aspx';

async function buildCredentials(item) {
  const parts = (item.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;
  if (parts.length === 1) parts.push(parts[0]); // handle single word names
  const username  = (parts[0] + parts[1]).toUpperCase();
  
  const { passPattern = '{F}@{f}#$1970' } = await chrome.storage.local.get(['passPattern']);
  
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
  // Fill first name greedily up to 20 chars, ensuring at least 1 word is left for last name
  while (idx < parts.length - 1 && (firstName.length + 1 + parts[idx].length) <= 20) {
    firstName += ' ' + parts[idx];
    idx++;
  }
  
  let lastName = parts.slice(idx).join(' ');
  
  // Enforce the hard 20-character limit just in case
  if (firstName.length > 20) firstName = firstName.substring(0, 20).trim();
  if (lastName.length > 20) lastName = lastName.substring(0, 20).trim();

  return { username, password, firstName, lastName };
}

// Automatically stop the extension if the user closes the active registration tab
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { currentTabId, singleRunning, isRunning } = await chrome.storage.local.get(['currentTabId', 'singleRunning', 'isRunning']);
  if (tabId === currentTabId) {
    if (singleRunning || isRunning) {
      await chrome.storage.local.set({ singleRunning: false, isRunning: false });
    }
  }
});

async function getState() {
  return chrome.storage.local.get(['queue','queueIndex','isRunning','currentTabId']);
}

// Save to history
async function saveToHistory(entry) {
  const { history = [] } = await chrome.storage.local.get(['history']);
  history.unshift({ ...entry, date: new Date().toISOString() });
  await chrome.storage.local.set({ history: history.slice(0, 500) });
}

// ── Progress Badge ────────────────────────────────────────────────────────────
async function updateBadge() {
  const { queue, queueIndex, isRunning } = await chrome.storage.local.get(['queue', 'queueIndex', 'isRunning']);
  if (isRunning && queue && queue.length > 0) {
    chrome.action.setBadgeText({ text: `${queueIndex + 1}/${queue.length}` });
    chrome.action.setBadgeBackgroundColor({ color: '#2ea043' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ✅ FIX 2: replaced recursion with iterative loop to prevent stack overflow
async function openNextTab() {
  const { queue, queueIndex, isRunning, currentTabId } = await getState();
  if (!isRunning) {
    await updateBadge();
    return;
  }

  // We need to loop forward until we find a pending item or reach the end.
  let newIdx = queueIndex;
  while (newIdx < queue.length && queue[newIdx].status !== 'pending') {
    newIdx++;
  }

  if (newIdx < queue.length) {
    await updateBadge();
    if (newIdx !== queueIndex) {
      await chrome.storage.local.set({ queueIndex: newIdx });
    }
    const creds = await buildCredentials(queue[newIdx]);
    if (creds) {
      await chrome.storage.local.set({ currentItem: { ...queue[newIdx], ...creds } });
      if (currentTabId) {
        try {
          await chrome.tabs.update(currentTabId, { url: START_URL });
        } catch (e) {
          const tab = await chrome.tabs.create({ url: START_URL });
          await chrome.storage.local.set({ currentTabId: tab.id });
        }
      } else {
        const tab = await chrome.tabs.create({ url: START_URL });
        await chrome.storage.local.set({ currentTabId: tab.id });
      }
    }
  } else {
    // End of queue
    await chrome.storage.local.set({ isRunning: false });
    await updateBadge();
    
    // Play sound / Show notification when batch completes
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon128.png',
      title: 'Batch Complete ✅',
      message: 'All registrations have been processed successfully.',
      priority: 1
    });
  }
}

// ── Message Routing ───────────────────────────────────────────────────────────
// background.js handles:  startSingle | startQueue | stopQueue | resumeQueue | stepDone | stepFailed
// bridge.js handles:      pauseBatch | resumeBatch | stopBatch | updateItem | saveCopied
// (bridge.js runs in the ISOLATED world and writes directly to chrome.storage —
//  no round-trip through background.js is needed for those actions.)
let isMsgProcessing = false;
const backgroundMsgQueue = [];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  backgroundMsgQueue.push({ msg, sender });
  processBackgroundQueue();
  return false;
});

async function processBackgroundQueue() {
  if (isMsgProcessing || backgroundMsgQueue.length === 0) return;
  isMsgProcessing = true;
  const { msg, sender } = backgroundMsgQueue.shift();
  try {
    await handleMessage(msg, sender);
  } catch (e) {
    console.error('Error handling message:', e);
  }
  isMsgProcessing = false;
  processBackgroundQueue();
}

async function handleMessage(msg, sender) {
  const { queue, queueIndex } = await getState();

  if (msg.action === 'stepDone') {
    const entry = {
      name:          msg.name          || '',
      finalUsername: msg.finalUsername || '',
      password:      msg.password      || '',
      email:         msg.email         || '',
      status:        'done'
    };

    if (queue && queueIndex < queue.length) {
      // 🛡️ VERIFICATION: Only increment if the name matches the expected current person
      // This prevents double-increments if messages are duplicated or arrive out of order
      if (queue[queueIndex].name === msg.name || !msg.name) {
        queue[queueIndex].status        = 'done';
        queue[queueIndex].finalUsername = msg.finalUsername || '';
        await chrome.storage.local.set({ queue, queueIndex: queueIndex + 1 });
      }
    }

    await saveToHistory(entry);

    // ✅ FIX 5: update savedCreds with the REAL finalUsername after registration
    await chrome.storage.local.set({
      savedCreds: {
        name:     msg.name          || '',
        username: msg.finalUsername || '',
        password: msg.password      || ''
      }
    });

    // If batch mode, open next tab after delay
    const { isRunning, userDelay = 5 } = await chrome.storage.local.get(['isRunning', 'userDelay']);
    if (isRunning) {
      await new Promise(r => setTimeout(r, userDelay * 1000));
      await openNextTab();
    } else {
      // Must be single mode, turn it off
      await chrome.storage.local.set({ singleRunning: false });
    }
  }

  if (msg.action === 'stepFailed') {
    const entry = {
      name:   msg.name   || '',
      status: 'failed',
      reason: msg.reason || 'Unknown error'
    };
    if (queue && queueIndex < queue.length) {
      if (queue[queueIndex].name === msg.name || !msg.name) {
        queue[queueIndex].status = 'failed';
        await chrome.storage.local.set({ queue, queueIndex: queueIndex + 1 });
      }
    }
    await saveToHistory(entry);
    const { isRunning } = await getState();
    if (isRunning) {
      await openNextTab();
    } else {
      // Single mode failure
      await chrome.storage.local.set({ singleRunning: false });
    }
  }

  if (msg.action === 'startSingle') {
    const item  = { ...msg.item, status: 'pending' };
    const creds = await buildCredentials(item);
    if (!creds) return;
    await chrome.storage.local.set({
      queue: [item], queueIndex: 0, isRunning: false, singleRunning: true,
      currentItem: { ...item, ...creds }
    });
    const tab = await chrome.tabs.create({ url: START_URL });
    await chrome.storage.local.set({ currentTabId: tab.id });
  }

  if (msg.action === 'startQueue') {
    // 🧹 CLEANUP: Close existing registration tab if any
    const { currentTabId } = await getState();
    if (currentTabId) {
      try { await chrome.tabs.remove(currentTabId); } catch(e) {}
    }
    
    const items = msg.items.map(i => ({ ...i, status: 'pending' }));
    await chrome.storage.local.set({ queue: items, queueIndex: 0, isRunning: true, currentTabId: null });
    await openNextTab();
  }

  if (msg.action === 'stopQueue') {
    await chrome.storage.local.set({ isRunning: false, singleRunning: false });
    await updateBadge();
  }

  if (msg.action === 'resumeQueue') {
    const { queue, queueIndex } = await getState();
    if (!queue || queueIndex >= queue.length) return;
    await chrome.storage.local.set({ isRunning: true });
    await openNextTab();
  }
}

// ── Context Menu (Icon Dropdown) ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pause_queue",
    title: "⏸ Pause Registration",
    contexts: ["action"]
  });
  chrome.contextMenus.create({
    id: "resume_queue",
    title: "▶ Resume Registration",
    contexts: ["action"]
  });
  chrome.contextMenus.create({
    id: "stop_clear",
    title: "⏹ Stop & Clear Queue",
    contexts: ["action"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "pause_queue") {
    await chrome.storage.local.set({ isRunning: false, singleRunning: false });
    await updateBadge();
  } else if (info.menuItemId === "resume_queue") {
    const { queue, queueIndex } = await getState();
    if (queue && queueIndex < queue.length) {
      await chrome.storage.local.set({ isRunning: true });
      await openNextTab();
    }
  } else if (info.menuItemId === "stop_clear") {
    await chrome.storage.local.set({ isRunning: false, singleRunning: false, queue: [], queueIndex: 0 });
    await updateBadge();
  }
});
