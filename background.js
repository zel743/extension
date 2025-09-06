let countdown;
let time = 10; // pruebas
let isRunning = false;
let isBreakTime = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'start') {
    isBreakTime = false;         // <- mover aquí
    startTimer();
  } else if (message.command === 'stop') {
    stopTimer();
  } else if (message.command === 'reset') {
    resetTimer();
  } else if (message.command === 'startBreak') {
    startBreakTimer();
  } else if (message.command === 'skipBreak') {
    skipBreak();
  } else if (message.command === 'getState') { // opcional
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
  } catch (e) {
    // si no existe, ignorar
  }
}

// Aplica/quita en pestañas ya abiertas inmediatamente
async function applyNowToAllOpenTabs(enable) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    const url = t.url || '';
    if (!t.id || !/^https?:|^file:/.test(url)) continue; // no se puede en chrome://, WebStore, etc.
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
    } catch (e) {
      // algunas páginas restringidas fallan: ignorar
    }
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

// Agrega este branch a tu listener onMessage existente
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
    return true; // respuesta async
  }
  // ...tus otros comandos start/stop/reset/etc siguen aquí...
});

function startTimer() {
  if (!isRunning) {
    isRunning = true;
    // OJO: ya NO tocamos isBreakTime aquí
    clearInterval(countdown);
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
  }
}

function resetTimer() {
  stopTimer();
  isBreakTime = false;
  time = 10; // o 25 * 60
  updatePopup();
}

function startBreakTimer() {
  isBreakTime = true;
  time = 5 * 60; // 5 minutos de descanso
  startTimer();
}

function skipBreak() {
  resetTimer();
}

function completeTimer() {
  clearInterval(countdown);
  isRunning = false;

  // Marca notificación pendiente para cuando se abra el popup
  chrome.storage.local.set({ pendingNotification: true });

  // Intenta avisar si el popup ya estuviera abierto (evita error si no)
  chrome.runtime.sendMessage({ showNotification: true }, () => {});
  
  // NO funciona sin gesto del usuario:
  // chrome.action.openPopup(); // <- quítalo
}

function updatePopup() {
  let minutes = Math.floor(time / 60);
  let seconds = time % 60;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  seconds = seconds < 10 ? '0' + seconds : seconds;

  chrome.runtime.sendMessage({ timer: `${minutes}:${seconds}` }, () => {});
}
function showSystemNotification() {
  const id = 'pomodoro-complete';

  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'images/tomato128.jpg', // asegúrate de que exista
    title: '¡Tiempo terminado!',
    message: 'Toma un descanso de 5 minutos.',
    requireInteraction: true,        // la mantiene visible hasta que el usuario interactúe (en macOS puede ignorarse)
    priority: 2,
    buttons: [
      { title: 'Iniciar descanso' },
      { title: 'Omitir' }
    ]
  });
}

// Click en botones de la notificación
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'pomodoro-complete') {
    if (buttonIndex === 0) {
      startBreakTimer();
    } else if (buttonIndex === 1) {
      skipBreak();
    }
    chrome.notifications.clear(notificationId);
    chrome.storage.local.remove('pendingNotification');
  }
});

// Click en el cuerpo de la notificación (opcional: abrir popup si quieres)
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'pomodoro-complete') {
    chrome.notifications.clear(notificationId);
    // Intentar abrir el popup (solo funciona con gesto del usuario y puede fallar en algunas plataformas)
    if (chrome.action && chrome.action.openPopup) {
      try { chrome.action.openPopup(); } catch (e) {}
    }
  }
});
function completeTimer() {
  clearInterval(countdown);
  isRunning = false;

  // Notificación del sistema
  showSystemNotification();

  // Flag para que el popup muestre el overlay si se abre después
  chrome.storage.local.set({ pendingNotification: true });

  // Si el popup está abierto, avísale
  chrome.runtime.sendMessage({ showNotification: true }, () => {});
}
