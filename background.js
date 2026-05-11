// background.js

const START_URL = 'https://tcnet1.prometric.com/Candidates/Candidate/Candidate_Info.aspx?Program=IBTA';
const LOGIN_URL = 'https://tcnet1.prometric.com/Candidates/Candidate/Main.aspx';

// ── State Management ──────────────────────────────────────────────────────────
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function showNotify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title: title,
    message: message,
    priority: 2
  });
}

async function buildCredentials(item) {
  const { passPattern } = await chrome.storage.local.get(['passPattern']);
  const pattern = passPattern || '{F}@{f}#$1970';
  
  const parts = item.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;
  if (parts.length === 1) parts.push(parts[0]);
  
  const F = parts[0][0].toUpperCase();
  const f = F.toLowerCase();
  const L = parts[parts.length-1][0].toUpperCase();
  const l = L.toLowerCase();
  
  const password = pattern
    .replace(/{F}/g, F)
    .replace(/{f}/g, f)
    .replace(/{L}/g, L)
    .replace(/{l}/g, l);
    
  const username = (parts[0] + parts[1]).toUpperCase();
  
  let firstName = parts[0];
  let idx = 1;
  while (idx < parts.length - 1 && (firstName.length + 1 + parts[idx].length) <= 20) {
    firstName += ' ' + parts[idx];
    idx++;
  }
  let lastName = parts.slice(idx).join(' ');
  if (firstName.length > 20) firstName = firstName.substring(0, 20).trim();
  if (lastName.length > 20) lastName = lastName.substring(0, 20).trim();
  
  return { username, password, firstName, lastName };
}

// ✅ FIX 2: replaced recursion with iterative loop to prevent stack overflow
async function openNextTab() {
  const { queue, queueIndex, isRunning, currentTabId } = await chrome.storage.local.get(['queue', 'queueIndex', 'isRunning', 'currentTabId']);
  if (!isRunning) return;

  let newIdx = queueIndex !== undefined ? queueIndex : 0;
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
    showNotify('Batch Complete ✅', `Finished registering ${queue.length} users.`);
  }
}

// ── Message Routing ───────────────────────────────────────────────────────────
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

  if (msg.action === 'stopQueue') {
    await chrome.storage.local.set({ isRunning: false, singleRunning: false });
    await updateBadge();
  }

  if (msg.action === 'resumeQueue') {
    if (!queue || queueIndex >= queue.length) return;
    await chrome.storage.local.set({ isRunning: true });
    await openNextTab();
  }

  if (msg.action === 'stepDone') {
    if (!queue || queueIndex === undefined) return;
    const newQueue = [...queue];
    newQueue[queueIndex].status = 'done';
    newQueue[queueIndex].result = msg.data;
    
    await saveToHistory({ ...newQueue[queueIndex], ...msg.data });
    await chrome.storage.local.set({ queue: newQueue, queueIndex: queueIndex + 1 });
    
    const { userDelay } = await chrome.storage.local.get(['userDelay']);
    setTimeout(() => { openNextTab(); }, (userDelay || 5) * 1000);
  }

  if (msg.action === 'stepFailed') {
    if (!queue || queueIndex === undefined) return;
    const newQueue = [...queue];
    newQueue[queueIndex].status = 'failed';
    newQueue[queueIndex].error  = msg.error;
    
    await chrome.storage.local.set({ queue: newQueue, queueIndex: queueIndex + 1, isRunning: false });
    await updateBadge();
    showNotify('Error ❌', `Registration failed for ${queue[queueIndex].name}: ${msg.error}`);
  }
}

// Context Menu (Right Click)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "stopAll",
    title: "Stop All Prometric Automations",
    contexts: ["action"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "stopAll") {
    chrome.storage.local.set({ isRunning: false, singleRunning: false });
    updateBadge();
  }
});
