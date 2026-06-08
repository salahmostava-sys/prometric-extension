const START_URL = 'https://tcnet1.prometric.com/InvalidHostHeader.aspx';
const DEFAULT_AUTO_RETRY = true;
const DEFAULT_DESKTOP_NOTIFICATIONS = true;
const DEFAULT_USER_DELAY = 2;
const DEFAULT_STABILITY_MODE = false;
let openNextInProgress = false;
let openNextPending = false;

function makeQueueId(prefix = 'q') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isCurrentQueueMessage(queue, queueIndex, msg, currentProcessingId = '') {
  if (!queue || queueIndex >= queue.length) return false;
  const current = queue[queueIndex];
  if (msg.queueId && currentProcessingId) return msg.queueId === currentProcessingId;
  if (msg.queueId) return current._queueId === msg.queueId;
  return current.name === msg.name || !msg.name;
}

function isRetryableFailure(reason = '', failureKind = '', retryable) {
  if (retryable === false) return false;
  if (retryable === true) return true;
  const text = `${failureKind} ${reason}`.toLowerCase();
  if (text.includes('username exhausted') || text.includes('duplicate') || text.includes('invalid email')) return false;
  return (
    text.includes('timeout') ||
    text.includes('not found') ||
    text.includes('missing') ||
    text.includes('page') ||
    text.includes('network') ||
    text.includes('unknown')
  );
}

function itemDedupKey(item) {
  const name = String(item.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const email = String(item.email || '').trim().toLowerCase();
  return `${name}|${email}`;
}

function dedupeItems(items) {
  const seen = new Set();
  const unique = [];
  let skipped = 0;

  for (const item of items || []) {
    const key = itemDedupKey(item);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return { unique, skipped };
}

async function keepRegistrationTabAlive(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: false });
  } catch (_) {}
}

// -- Dedicated registration window ------------------------------------------
// Runs in a MINIMIZED window so it stays out of the user's way.
// Because the tab IS the active tab of that window, Chrome does NOT throttle
// its timers — giving full speed without the user needing to watch the tab.
async function getRegistrationTabId(url) {
  const { regWindowId } = await chrome.storage.local.get(['regWindowId']);
  if (regWindowId) {
    try {
      const win = await chrome.windows.get(regWindowId, { populate: true });
      if (win && win.tabs && win.tabs.length > 0) {
        const tabId = win.tabs[0].id;
        await chrome.tabs.update(tabId, { url });
        await keepRegistrationTabAlive(tabId);
        await chrome.storage.local.set({ currentTabId: tabId });
        return tabId;
      }
    } catch (_) {
      await chrome.storage.local.remove('regWindowId');
    }
  }
  // Create a fresh minimized window
  const win = await chrome.windows.create({ url, state: 'minimized', focused: false });
  const tabs = win.tabs || await chrome.tabs.query({ windowId: win.id });
  const tabId = (tabs && tabs.length > 0) ? tabs[0].id : null;
  if (tabId) {
    await keepRegistrationTabAlive(tabId);
    await chrome.storage.local.set({ currentTabId: tabId, regWindowId: win.id });
  }
  return tabId;
}

async function closeRegistrationWindow() {
  const { regWindowId } = await chrome.storage.local.get(['regWindowId']);
  if (regWindowId) {
    try { await chrome.windows.remove(regWindowId); } catch (_) {}
    await chrome.storage.local.remove('regWindowId');
  }
}

// Clear regWindowId if the user closes the window manually
chrome.windows.onRemoved.addListener(async (windowId) => {
  const { regWindowId } = await chrome.storage.local.get(['regWindowId']);
  if (windowId === regWindowId) {
    await chrome.storage.local.remove('regWindowId');
    // Also stop any running process
    const { isRunning, singleRunning } = await chrome.storage.local.get(['isRunning', 'singleRunning']);
    if (isRunning || singleRunning) {
      await chrome.storage.local.set({ isRunning: false, singleRunning: false });
    }
  }
});
async function buildCredentials(item) {
  const parts = (item.name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1) return null;
  
  // Clean parts to keep only alphabetical letters for the username
  const cleanedParts = parts.map(p => p.replace(/[^A-Za-z]/g, '')).filter(Boolean);
  const uPart1 = cleanedParts[0] || 'USER';
  const uPart2 = cleanedParts[1] || uPart1;
  const username = (uPart1 + uPart2).toUpperCase();
  
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
  return chrome.storage.local.get(['queue','queueIndex','isRunning','currentTabId','currentProcessingId','activeQueueId']);
}

// Save to history
async function saveToHistory(entry) {
  const { history = [] } = await chrome.storage.local.get(['history']);
  history.unshift({ ...entry, date: new Date().toISOString() });
  await chrome.storage.local.set({ history: history.slice(0, 500) });
}

async function addRunLog(message, type = 'info') {
  const { runLogs = [] } = await chrome.storage.local.get(['runLogs']);
  runLogs.unshift({ message, type, date: new Date().toISOString() });
  await chrome.storage.local.set({ runLogs: runLogs.slice(0, 200) });
}

// -- Progress Badge ---
async function updateBadge() {
  const { queue, queueIndex, isRunning } = await chrome.storage.local.get(['queue', 'queueIndex', 'isRunning']);
  if (isRunning && queue && queue.length > 0) {
    chrome.action.setBadgeText({ text: `${queueIndex + 1}/${queue.length}` });
    chrome.action.setBadgeBackgroundColor({ color: '#2ea043' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// OK FIX 2: replaced recursion with iterative loop to prevent stack overflow
async function processEndOfQueue() {
  const { autoRetry } = await chrome.storage.local.get(['autoRetry']);
  const { queue: latestQueue = [] } = await chrome.storage.local.get(['queue']);

  const failedItems = latestQueue.filter(i =>
    i.status === 'failed' &&
    !i.retried &&
    isRetryableFailure(i.failureReason, i.failureKind, i.retryable)
  );

  if ((autoRetry ?? DEFAULT_AUTO_RETRY) && failedItems.length > 0) {
    failedItems.forEach(i => {
      i.status = 'pending';
      i.failureReason = '';
      i.retried = true;
    });
    const firstPendingIdx = latestQueue.findIndex(i => i.status === 'pending');
    await chrome.storage.local.set({ queue: latestQueue, queueIndex: firstPendingIdx >= 0 ? firstPendingIdx : 0 });
    openNextPending = true;
    return;
  }

  await chrome.storage.local.set({ isRunning: false, currentProcessingId: '' });
  await updateBadge();

  const { desktopNotifications } = await chrome.storage.local.get(['desktopNotifications']);

  const done   = latestQueue.filter(i => i.status === 'done').length;
  const failed = latestQueue.filter(i => i.status === 'failed').length;

  if (desktopNotifications ?? DEFAULT_DESKTOP_NOTIFICATIONS) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Batch Complete OK',
      message: `Registration finished: ${done} Successful, ${failed} Failed.`,
      priority: 2
    });
  }
}

async function openNextTab() {
  if (openNextInProgress) {
    openNextPending = true;
    await addRunLog('Queued duplicate open-next request', 'warn');
    return;
  }

  openNextInProgress = true;
  openNextPending = false;
  try {
    const { queue, queueIndex, isRunning } = await getState();
    if (!isRunning) {
      await updateBadge();
      return;
    }

    let newIdx = queueIndex;
    while (newIdx < queue.length && queue[newIdx].status !== 'pending') {
      newIdx++;
    }

    if (newIdx < queue.length) {
      await updateBadge();
      if (!queue[newIdx]._queueId) {
        queue[newIdx]._queueId = makeQueueId('item');
        await chrome.storage.local.set({ queue });
      }
      if (newIdx !== queueIndex) {
        await chrome.storage.local.set({ queueIndex: newIdx });
      }
      const creds = await buildCredentials(queue[newIdx]);
      if (creds) {
        await chrome.storage.local.set({
          currentItem: { ...queue[newIdx], ...creds },
          currentProcessingId: queue[newIdx]._queueId
        });
        await addRunLog(`Processing: ${queue[newIdx].name || 'Unnamed'}`, 'running');
        await getRegistrationTabId(START_URL);
      }
    } else {
      await processEndOfQueue();
    }
  } finally {
    openNextInProgress = false;
    if (openNextPending) {
      openNextPending = false;
      await openNextTab();
    }
  }
}

// -- Message Routing ---
// background.js handles:  startSingle | startQueue | stopQueue | resumeQueue | stepDone | stepFailed
// bridge.js handles:      pauseBatch | resumeBatch | stopBatch | updateItem | saveCopied
// (bridge.js runs in the ISOLATED world and writes directly to chrome.storage -
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

// -- Message Routing ---
// background.js handles:  startSingle | startQueue | stopQueue | resumeQueue | stepDone | stepFailed
// bridge.js handles:      pauseBatch | resumeBatch | stopBatch | updateItem | saveCopied
// (bridge.js runs in the ISOLATED world and writes directly to chrome.storage -
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

async function handleStepDone(msg, state) {
  const { queue, queueIndex, currentProcessingId } = state;
  const entry = {
    name:          msg.name          || '',
    finalUsername: msg.finalUsername || '',
    password:      msg.password      || '',
    email:         msg.email         || '',
    status:        'done',
    url:           msg.url           || '',
    step:          msg.step          || ''
  };

  let accepted = false;
  if (isCurrentQueueMessage(queue, queueIndex, msg, currentProcessingId)) {
    queue[queueIndex].status        = 'done';
    queue[queueIndex].finalUsername = msg.finalUsername || '';
    queue[queueIndex].failureReason = '';
    queue[queueIndex].failureKind   = '';
    queue[queueIndex].retryable     = false;
    queue[queueIndex].failureUrl    = '';
    queue[queueIndex].failureStep   = '';
    queue[queueIndex].pageSnippet   = '';
    await chrome.storage.local.set({ queue, queueIndex: queueIndex + 1 });
    accepted = true;
  }
  if (!accepted && queue) {
    await addRunLog(`Ignored stale done message: ${entry.name || entry.finalUsername || 'Unknown item'}`, 'warn');
    return;
  }

  await saveToHistory(entry);
  await addRunLog(`Done: ${entry.name || entry.finalUsername || 'Current item'}`, 'done');

  await chrome.storage.local.set({
    savedCreds: {
      name:     msg.name          || '',
      username: msg.finalUsername || '',
      password: msg.password      || ''
    }
  });

  await chrome.storage.local.set({ currentProcessingId: '' });
  const { isRunning, userDelay = DEFAULT_USER_DELAY, stabilityMode = DEFAULT_STABILITY_MODE } = await chrome.storage.local.get(['isRunning', 'userDelay', 'stabilityMode']);
  if (isRunning) {
    const delay = Math.max(Number(userDelay) || DEFAULT_USER_DELAY, stabilityMode ? 3 : 0);
    setTimeout(async () => {
      const { isRunning: stillRunning } = await chrome.storage.local.get(['isRunning']);
      if (stillRunning) await openNextTab();
    }, delay * 1000);
  } else {
    await chrome.storage.local.set({ singleRunning: false });
  }
}

async function handleStepFailed(msg, state) {
  const { queue, queueIndex, currentProcessingId } = state;
  const entry = {
    name:   msg.name   || '',
    email:  (queue && queueIndex < queue.length ? queue[queueIndex].email : '') || '',
    status: 'failed',
    reason: msg.reason || 'Unknown error',
    failureKind: msg.failureKind || '',
    retryable: msg.retryable,
    url: msg.url || '',
    step: msg.step || '',
    pageSnippet: msg.pageSnippet || ''
  };
  let accepted = false;
  if (isCurrentQueueMessage(queue, queueIndex, msg, currentProcessingId)) {
    queue[queueIndex].status = 'failed';
    queue[queueIndex].failureReason = entry.reason;
    queue[queueIndex].failureKind = entry.failureKind;
    queue[queueIndex].retryable = isRetryableFailure(entry.reason, entry.failureKind, entry.retryable);
    queue[queueIndex].failureUrl = entry.url;
    queue[queueIndex].failureStep = entry.step;
    queue[queueIndex].pageSnippet = entry.pageSnippet;
    await chrome.storage.local.set({ queue, queueIndex: queueIndex + 1 });
    accepted = true;
  }
  if (!accepted && queue) {
    await addRunLog(`Ignored stale failed message: ${entry.name || 'Unknown item'} - ${entry.reason}`, 'warn');
    return;
  }
  await saveToHistory(entry);
  await addRunLog(`Failed: ${entry.name || 'Current item'} - ${entry.reason}`, 'failed');
  await chrome.storage.local.set({ currentProcessingId: '' });
  const { isRunning } = await getState();
  if (isRunning) {
    await openNextTab();
  } else {
    await chrome.storage.local.set({ singleRunning: false });
  }
}

async function handleStartSingle(msg) {
  const activeQueueId = makeQueueId('run');
  const item  = { ...msg.item, status: 'pending', _queueId: makeQueueId('single'), _runId: activeQueueId };
  const creds = await buildCredentials(item);
  if (!creds) return;
  await addRunLog(`Single started: ${item.name || 'Unnamed'}`, 'start');
  await chrome.storage.local.set({
    queue: [item], queueIndex: 0, isRunning: false, singleRunning: true,
    currentItem: { ...item, ...creds },
    activeQueueId,
    currentProcessingId: item._queueId
  });
  await getRegistrationTabId(START_URL);
}

async function handleStartQueue(msg) {
  await closeRegistrationWindow();
  const { unique, skipped } = dedupeItems(msg.items);
  const activeQueueId = makeQueueId('run');
  const batchId = makeQueueId('batch');
  const items = unique.map((i, idx) => ({
    ...i,
    _queueId: `${batchId}_${idx}`,
    _runId: activeQueueId,
    status: 'pending',
    failureReason: ''
  }));
  await chrome.storage.local.set({
    queue: items,
    queueIndex: 0,
    isRunning: true,
    currentTabId: null,
    currentProcessingId: '',
    activeQueueId,
    lastDedupeSkipped: skipped,
    runLogs: []
  });
  await addRunLog(`Batch started: ${items.length} items`, 'start');
  if (skipped) await addRunLog(`Skipped duplicate rows: ${skipped}`, 'warn');
  await openNextTab();
}

async function handlePauseQueue() {
  await chrome.storage.local.set({ isRunning: false });
  await addRunLog('Registration paused', 'pause');
  await updateBadge();
}

async function handleStopQueue() {
  await chrome.storage.local.set({ isRunning: false, singleRunning: false });
  await addRunLog('Registration stopped', 'stop');
  await updateBadge();
}

async function handleResumeQueue() {
  const { queue, queueIndex } = await getState();
  if (!queue || queueIndex >= queue.length) {
    await addRunLog('Queue already completed — nothing to resume', 'warn');
    return;
  }
  await chrome.storage.local.set({ isRunning: true });
  await addRunLog('Queue resumed', 'resume');
  await openNextTab();
}

async function handleRetryFailed() {
  const { queue = [] } = await chrome.storage.local.get(['queue']);
  const failed = queue.filter(i => i.status === 'failed');
  if (!failed.length) return;
  queue.forEach(i => {
    if (i.status === 'failed') {
      i.status = 'pending';
      i.failureReason = '';
      i.failureKind = '';
      i.failureUrl = '';
      i.failureStep = '';
      i.pageSnippet = '';
      i.retryable = true;
      i.retried = true;
    }
  });
  const firstPendingIdx = queue.findIndex(i => i.status === 'pending');
  await chrome.storage.local.set({ queue, queueIndex: firstPendingIdx >= 0 ? firstPendingIdx : 0, isRunning: true, singleRunning: false });
  await addRunLog(`Retrying failed items: ${failed.length}`, 'retry');
  await openNextTab();
}

async function handleClearSession() {
  await closeRegistrationWindow();
  await chrome.storage.local.remove(['queue', 'queueIndex', 'currentItem', 'isRunning', 'singleRunning', 'currentTabId', 'copiedCreds', 'savedCreds', 'currentProcessingId', 'activeQueueId', 'lastDedupeSkipped', 'regWindowId']);
  await chrome.storage.local.set({ runLogs: [] });
  await updateBadge();
}

async function handleMessage(msg, sender) {
  const state = await getState();
  const handlers = {
    stepDone: () => handleStepDone(msg, state),
    stepFailed: () => handleStepFailed(msg, state),
    startSingle: () => handleStartSingle(msg),
    startQueue: () => handleStartQueue(msg),
    pauseQueue: () => handlePauseQueue(),
    stopQueue: () => handleStopQueue(),
    resumeQueue: () => handleResumeQueue(),
    retryFailed: () => handleRetryFailed(),
    clearSession: () => handleClearSession()
  };
  
  if (handlers[msg.action]) {
    await handlers[msg.action]();
  }
}

// -- Context Menu (Icon Dropdown) ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "pause_queue", title: "Pause Registration", contexts: ["action"] });
  chrome.contextMenus.create({ id: "resume_queue", title: "Resume Registration", contexts: ["action"] });
  chrome.contextMenus.create({ id: "stop_clear", title: "Stop & Clear Queue", contexts: ["action"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "pause_queue") {
    // Pause-only: same semantics as pauseQueue handler — only freezes isRunning.
    // Do NOT touch singleRunning here; that would incorrectly kill single-mode sessions.
    await chrome.storage.local.set({ isRunning: false });
    await addRunLog('Registration paused via context menu', 'pause');
    await updateBadge();
  } else if (info.menuItemId === "resume_queue") {
    const { queue, queueIndex } = await getState();
    if (queue && queueIndex < queue.length) {
      await chrome.storage.local.set({ isRunning: true });
      await openNextTab();
    }
  } else if (info.menuItemId === "stop_clear") {
    await closeRegistrationWindow();
    await chrome.storage.local.set({ isRunning: false, singleRunning: false, queue: [], queueIndex: 0, runLogs: [] });
    await chrome.storage.local.remove(['currentItem', 'currentTabId', 'copiedCreds', 'savedCreds', 'currentProcessingId', 'activeQueueId', 'lastDedupeSkipped', 'regWindowId']);
    await updateBadge();
  }
});
