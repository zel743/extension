// @ts-nocheck
import { hello } from './pages/hello'
hello()

// ====== Configuration ======
const WORK_TIME = 25 * 60 // 10 seconds for testing (change to 25 * 60 for 25min)
const BREAK_TIME = 5 * 60 // 5 minutes break (5 * 60)

let countdown
let time = WORK_TIME
let isRunning = false
let isBreakTime = false
let currentTabId = null
let focusEnforcer = null
let currentPageReason = ''
// last allowed URL to enforce navigation within saved domains during focus
let lastAllowedUrl = ''

// ====== Main message listener ======
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'openSavedPage') {
    ;(async () => {
      const tab = await chrome.tabs.create({ url: message.url })
      if (isRunning && !isBreakTime) currentTabId = tab.id
    })()
    return true
  } else if (message.command === 'start') {
    isBreakTime = false
    startTimer()
  } else if (message.command === 'stop') {
    stopTimer()
  } else if (message.command === 'reset') {
    resetTimer()
  } else if (message.command === 'startBreak') {
    startBreakTimer()
  } else if (message.command === 'skipBreak') {
    skipBreak()
  } else if (message.command === 'getState') {
    sendResponse({ time, isRunning, isBreakTime })
    return true
  }
})

// ====== OpenDyslexic global ======
const OD_SCRIPT_ID = 'od-global'
const OD_CSS_FILE = 'public/font.css'

async function registerODGlobal() {
  try {
    await chrome.scripting.registerContentScripts([
      {
        id: OD_SCRIPT_ID,
        matches: ['<all_urls>'],
        css: [OD_CSS_FILE],
        runAt: 'document_start',
        allFrames: true,
        persistAcrossSessions: true,
      },
    ])
  } catch (e) {
    if (!String(e?.message).includes('already exists')) {
      console.warn('registerODGlobal error:', e)
    }
  }
}

async function unregisterODGlobal() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [OD_SCRIPT_ID] })
  } catch (e) {}
}

async function applyNowToAllOpenTabs(enable) {
  const tabs = await chrome.tabs.query({})
  for (const t of tabs) {
    const url = t.url || ''
    if (!t.id || !/^https?:|^file:/.test(url)) continue
    try {
      if (enable) {
        await chrome.scripting.insertCSS({
          target: { tabId: t.id, allFrames: true },
          files: [OD_CSS_FILE],
        })
      } else {
        await chrome.scripting.removeCSS({
          target: { tabId: t.id, allFrames: true },
          files: [OD_CSS_FILE],
        })
      }
    } catch (e) {}
  }
}

async function initODGlobal() {
  const { odGlobal = false } = await chrome.storage.local.get('odGlobal')
  if (odGlobal) {
    await registerODGlobal()
    await applyNowToAllOpenTabs(true)
  } else {
    await unregisterODGlobal()
  }
}
initODGlobal()
chrome.runtime.onInstalled.addListener(initODGlobal)
chrome.runtime.onStartup?.addListener(initODGlobal)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.command === 'setODGlobal') {
    ;(async () => {
      const enable = !!message.enabled
      await chrome.storage.local.set({ odGlobal: enable })
      if (enable) {
        await registerODGlobal()
      } else {
        await unregisterODGlobal()
      }
      await applyNowToAllOpenTabs(enable)
      sendResponse({ ok: true })
    })()
    return true
  }
})

// ====== Pomodoro Timer Functions ======
async function startTimer() {
  if (!isRunning) {
    // Check if current page is in saved list with a reason
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (tab && tab.url) {
      const { savedPages = [] } = await chrome.storage.local.get('savedPages')
      // Match saved domain origins or full URLs for legacy entries
      const origin = (() => {
        try {
          return new URL(tab.url).origin
        } catch {
          return tab.url
        }
      })()
      const currentPage = savedPages.find((page) => (page.origin || new URL(page.url).origin) === origin)

      if (!currentPage || !currentPage.reason) {
        // Don't start timer if page is not saved or has no reason
        console.log('Cannot start timer: Page not saved or no reason provided')
        return
      }

      currentTabId = tab.id
      currentPageReason = currentPage.reason // Store the reason for notifications
      // store the initial allowed URL for focus enforcement
      lastAllowedUrl = tab.url
    }

    isRunning = true
    clearInterval(countdown)
    startEnforcer()

    countdown = setInterval(() => {
      if (time > 0) {
        time--
        updatePopup()
      } else {
        completeTimer()
      }
    }, 1000)
  }
}

function stopTimer() {
  if (isRunning) {
    isRunning = false
    clearInterval(countdown)
    stopEnforcer()
  }
}

function resetTimer() {
  stopTimer()
  isBreakTime = false
  time = WORK_TIME
  updatePopup()
}

function startBreakTimer() {
  isBreakTime = true
  time = BREAK_TIME
  startTimer()
}

function skipBreak() {
  resetTimer()
}

function updatePopup() {
  let minutes = Math.floor(time / 60)
  let seconds = time % 60
  minutes = minutes < 10 ? '0' + minutes : minutes
  seconds = seconds < 10 ? '0' + seconds : seconds
  chrome.runtime.sendMessage({ timer: `${minutes}:${seconds}` }, () => {})
}

// Modify showSystemNotification to accept custom message
function showSystemNotification(message = 'Toma un descanso de 5 minutos.') {
  const id = 'pomodoro-complete'
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'public/images/tomato128.jpg',
    title: '¡Tiempo terminado!',
    message: message,
    requireInteraction: true,
    priority: 2,
    buttons: [{ title: 'Iniciar descanso' }, { title: 'Omitir' }],
  })
}

// Modify the completeTimer function to include the reason
// Modify the completeTimer function to handle both cases
function completeTimer() {
  clearInterval(countdown)
  isRunning = false
  stopEnforcer()

  if (isBreakTime) {
    // Break timer just ended - reset back to work mode
    isBreakTime = false
    time = WORK_TIME
    
    // Store break completion state
    chrome.storage.local.set({ 
      pendingNotification: true, 
      breakCompleted: true 
    })
    
    // Send message to show break completion notification
    chrome.runtime.sendMessage({ 
      showNotification: true,
      isBreakComplete: true 
    })
    
  } else {
    // Work timer ended - offer break
    const notificationMessage = currentPageReason
      ? `"${currentPageReason}" - Time's up! Take a 5 minute break.`
      : 'Toma un descanso de 5 minutos.'

    showSystemNotification(notificationMessage)
    
    // Store work completion state
    chrome.storage.local.set({ 
      pendingNotification: true, 
      breakCompleted: false 
    })
    
    // Send message to show work completion notification
    chrome.runtime.sendMessage({ 
      showNotification: true,
      isBreakComplete: false 
    })
  }

  updatePopup()
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'pomodoro-complete') {
    if (buttonIndex === 0) {
      // Start Break button clicked (from system notification)
      startBreakTimer()
    } else if (buttonIndex === 1) {
      // Skip Break button clicked (from system notification)
      skipBreak()
    }
    chrome.notifications.clear(notificationId)
    chrome.storage.local.remove('pendingNotification')
  }
})

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'pomodoro-complete') {
    chrome.notifications.clear(notificationId)
    if (chrome.action && chrome.action.openPopup) {
      try {
        chrome.action.openPopup()
      } catch (e) {}
    }
  }
})

// ====== Alert Notification ======
function showAlertNotification(tabId, message) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg) => {
      alert('⏰ Pomodoro Focus\n' + msg)
    },
    args: [message],
  })
}

// ====== Tab Focus Enforcement ======
function startEnforcer() {
  if (focusEnforcer) return
  focusEnforcer = setInterval(async () => {
    if (isRunning && !isBreakTime && currentTabId) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })

      if (activeTab) {
        // Allow switching within saved domains: update focus target if on a saved origin
        let allowSwitch = false
        try {
          const { savedPages = [] } = await chrome.storage.local.get('savedPages')
          const origin = new URL(activeTab.url).origin
          allowSwitch = savedPages.some((p) => p.origin === origin)
        } catch {
          allowSwitch = false
        }
        if (allowSwitch) {
          currentTabId = activeTab.id
          lastAllowedUrl = activeTab.url
          return
        }
        // Redirect back and restore last allowed URL when navigating outside saved domains
        chrome.tabs.update(currentTabId, { active: true, url: lastAllowedUrl })
        setTimeout(() => {
          showAlertNotification(
            currentTabId,
            `Please stay focused on this tab until the timer ends. \n ${currentPageReason}`,
          )
        }, 300)
      }
    }
  }, 1000)
}

function stopEnforcer() {
  if (focusEnforcer) {
    clearInterval(focusEnforcer)
    focusEnforcer = null
  }
}
