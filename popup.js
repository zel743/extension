// Utilidad rápida
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  // 1) Mostrar notificación si el background dejó una pendiente
  const { pendingNotification } = await chrome.storage.local.get('pendingNotification');
  if (pendingNotification) {
    $('notification')?.classList.remove('hidden');
    chrome.storage.local.remove('pendingNotification');
  }

  // 2) Pintar tiempo actual del timer
  chrome.runtime.sendMessage({ command: 'getState' }, (state) => {
    if (!state) {
      $('timer').textContent = '00:10'; // valor inicial por defecto
      return;
    }
    const minutes = Math.floor(state.time / 60).toString().padStart(2, '0');
    const seconds = (state.time % 60).toString().padStart(2, '0');
    $('timer').textContent = `${minutes}:${seconds}`;
  });

  // 3) Botones Pomodoro
  $('start')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'start' });
    $('reset') && ($('reset').disabled = false);
  });
  $('stop')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'stop' });
  });
  $('reset')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'reset' });
  });

  // 4) Botones de notificación
  $('startBreak')?.addEventListener('click', () => {
    $('notification')?.classList.add('hidden');
    chrome.runtime.sendMessage({ command: 'startBreak' });
  });
  $('skipBreak')?.addEventListener('click', () => {
    $('notification')?.classList.add('hidden');
    chrome.runtime.sendMessage({ command: 'skipBreak' });
  });

  // 5) Toggle OpenDyslexic GLOBAL
  const toggleOD = $('toggleOpenDyslexic');
  const { odGlobal = false } = await chrome.storage.local.get('odGlobal');
  if (toggleOD) toggleOD.checked = !!odGlobal;

  toggleOD?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
      await chrome.runtime.sendMessage({ command: 'setODGlobal', enabled });
    } catch (err) {
      console.error('Error al aplicar OpenDyslexic global:', err);
      toggleOD.checked = !enabled;
    }
  });
});

// 6) Listener para actualizaciones en tiempo real desde el background
chrome.runtime.onMessage.addListener((message) => {
  if (message.timer) {
    $('timer').textContent = message.timer;
  }
  if (message.showNotification) {
    $('notification')?.classList.remove('hidden');
  }
});
// Timer toggle functionality
const timerToggle = $('toggleTimer');
const timerSection = $('timerSection');

timerToggle?.addEventListener('change', function () {
  if (this.checked) {
    timerSection.classList.remove('is-hidden');
  } else {
    timerSection.classList.add('is-hidden');
  }
});
