// ====== Configuration ======
const WORK_TIME = 10; // 10 seconds for testing (change to 25 * 60 for 25min)
const BREAK_TIME = 5 * 60; // 5 minutes break

let countdown;
let time = WORK_TIME;
let isRunning = false;
let isBreakTime = false;
let currentTabId = null;
let focusEnforcer = null;
let currentPageReason = '';

// ====== Main message listener ======
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'start') {
    isBreakTime = false;
    startTimer();
  } else if (message.command === 'stop') {
    stopTimer();
  } else if (message.command === 'reset') {
    resetTimer();
  } else if (message.command === 'startBreak') {
    startBreakTimer();
  } else if (message.command === 'skipBreak') {
    skipBreak();
  } else if (message.command === 'getState') {
    sendResponse({ time, isRunning, isBreakTime });
    return true;
  }
});

// ====== OpenDyslexic global ======
const OD_SCRIPT_ID = 'od-global';
const OD_CSS_FILE = 'font.css';

async function registerODGlobal() {
  try {
    await chrome.scripting.registerContentScripts([{
      id: OD_SCRIPT_ID,
      matches: ['<all_urls>'],
      css: [OD_CSS_FILE],
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: true
    }]);
  } catch (e) {
    if (!String(e?.message).includes('already exists')) {
      console.warn('registerODGlobal error:', e);
    }
  }
}

async function unregisterODGlobal() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [OD_SCRIPT_ID] });
  } catch (e) {}
}

async function applyNowToAllOpenTabs(enable) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    const url = t.url || '';
    if (!t.id || !/^https?:|^file:/.test(url)) continue;
    try {
      if (enable) {
        await chrome.scripting.insertCSS({
          target: { tabId: t.id, allFrames: true },
          files: [OD_CSS_FILE]
        });
      } else {
        await chrome.scripting.removeCSS({
          target: { tabId: t.id, allFrames: true },
          files: [OD_CSS_FILE]
        });
      }
    } catch (e) {}
  }
}

async function initODGlobal() {
  const { odGlobal = false } = await chrome.storage.local.get('odGlobal');
  if (odGlobal) {
    await registerODGlobal();
    await applyNowToAllOpenTabs(true);
  } else {
    await unregisterODGlobal();
  }
}
initODGlobal();
chrome.runtime.onInstalled.addListener(initODGlobal);
chrome.runtime.onStartup?.addListener(initODGlobal);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.command === 'setODGlobal') {
    (async () => {
      const enable = !!message.enabled;
      await chrome.storage.local.set({ odGlobal: enable });
      if (enable) {
        await registerODGlobal();
      } else {
        await unregisterODGlobal();
      }
      await applyNowToAllOpenTabs(enable);
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// ====== Pomodoro Timer Functions ======
async function startTimer() {
  if (!isRunning) {
    // Check if current page is in saved list with a reason
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const { savedPages = [] } = await chrome.storage.local.get('savedPages');
      const currentPage = savedPages.find(page => page.url === tab.url);
      
      if (!currentPage || !currentPage.reason) {
        // Don't start timer if page is not saved or has no reason
        console.log('Cannot start timer: Page not saved or no reason provided');
        return;
      }
      
      currentTabId = tab.id;
      currentPageReason = currentPage.reason; // Store the reason for notifications
    }

    isRunning = true;
    clearInterval(countdown);
    startEnforcer();

    countdown = setInterval(() => {
      if (time > 0) {
        time--;
        updatePopup();
      } else {
        completeTimer();
      }
    }, 1000);
  }
}

function stopTimer() {
  if (isRunning) {
    isRunning = false;
    clearInterval(countdown);
    stopEnforcer();
  }
}

function resetTimer() {
  stopTimer();
  isBreakTime = false;
  time = WORK_TIME;
  updatePopup();
}

function startBreakTimer() {
  isBreakTime = true;
  time = BREAK_TIME;
  startTimer();
}

function skipBreak() {
  resetTimer();
}

function updatePopup() {
  let minutes = Math.floor(time / 60);
  let seconds = time % 60;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  seconds = seconds < 10 ? '0' + seconds : seconds;
  chrome.runtime.sendMessage({ timer: `${minutes}:${seconds}` }, () => {});
}

// Modify showSystemNotification to accept custom message
function showSystemNotification(message = 'Toma un descanso de 5 minutos.') {
  const id = 'pomodoro-complete';
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'images/tomato128.jpg',
    title: '¡Tiempo terminado!',
    message: message,
    requireInteraction: true,
    priority: 2,
    buttons: [
      { title: 'Iniciar descanso' },
      { title: 'Omitir' }
    ]
  });
}

// Modify the completeTimer function to include the reason
function completeTimer() {
  clearInterval(countdown);
  isRunning = false;
  stopEnforcer();
  
  // Include the reason in the notification
  const notificationMessage = currentPageReason 
    ? `"${currentPageReason}" - Time's up! Take a 5 minute break.`
    : 'Toma un descanso de 5 minutos.';
  
  showSystemNotification(notificationMessage);
  chrome.storage.local.set({ pendingNotification: true });
  chrome.runtime.sendMessage({ showNotification: true }, () => {});
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'pomodoro-complete') {
    if (buttonIndex === 0) startBreakTimer();
    else if (buttonIndex === 1) skipBreak();
    chrome.notifications.clear(notificationId);
    chrome.storage.local.remove('pendingNotification');
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'pomodoro-complete') {
    chrome.notifications.clear(notificationId);
    if (chrome.action && chrome.action.openPopup) {
      try { chrome.action.openPopup(); } catch (e) {}
    }
  }
});

// ====== Alert Notification ======
function showAlertNotification(tabId, message) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg) => {
      alert('⏰ Pomodoro Focus\n' + msg);
    },
    args: [message]
  });
}

// ====== Tab Focus Enforcement ======
function startEnforcer() {
  if (focusEnforcer) return;
  focusEnforcer = setInterval(async () => {
    if (isRunning && !isBreakTime && currentTabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (activeTab && activeTab.id !== currentTabId) {
        // Redirect back to work tab first
        chrome.tabs.update(currentTabId, { active: true });
        
        // Get the saved reason for this tab
        const { savedPages = [] } = await chrome.storage.local.get('savedPages');
        const [currentTab] = await chrome.tabs.get(currentTabId);
        
        let alertMessage = 'Please stay focused on this tab until the timer ends.';
        
        // Add the reason if available
        if (currentTab && currentTab.url) {
          const pageInfo = savedPages.find(page => page.url === currentTab.url);
          if (pageInfo && pageInfo.reason) {
            alertMessage += `\n\nRemember: ${pageInfo.reason}`;
          }
        }
        
        // Then show alert on the main work tab
        setTimeout(() => {
          showAlertNotification(currentTabId, alertMessage);
        }, 300);
      }
    }
  }, 1000);
}

function stopEnforcer() {
  if (focusEnforcer) {
    clearInterval(focusEnforcer);
    focusEnforcer = null;
  }
}

// ====== Tab Switching Prevention ======
chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabChange(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    handleTabChange(tabId);
  }
});

async function handleTabChange(newTabId) {
  if (isRunning && !isBreakTime) {
    if (currentTabId && newTabId !== currentTabId) {
      // Redirect back to work tab first
      chrome.tabs.update(currentTabId, { active: true });
      
      // Get the saved reason for this tab
      const { savedPages = [] } = await chrome.storage.local.get('savedPages');
      const [currentTab] = await chrome.tabs.get(currentTabId);
      
      let alertMessage = 'You cannot change tabs until the timer ends. Stay focused on this tab!';
      
      // Add the reason if available
      if (currentTab && currentTab.url) {
        const pageInfo = savedPages.find(page => page.url === currentTab.url);
        if (pageInfo && pageInfo.reason) {
          alertMessage += `\n\nRemember: ${pageInfo.reason}`;
        }
      }
      
      // Then show alert on the main work tab
      setTimeout(() => {
        showAlertNotification(currentTabId, alertMessage);
      }, 300);
    } else {
      currentTabId = newTabId;
    }
  } else {
    currentTabId = newTabId;
  }
}