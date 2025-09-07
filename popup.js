// ===================
// Utilidad rápida
// ===================
const $ = (id) => document.getElementById(id);

// ===================
// Pomodoro + opciones
// ===================
document.addEventListener('DOMContentLoaded', async () => {
  // 1) Notificación pendiente
  const { pendingNotification } = await chrome.storage.local.get('pendingNotification');
  if (pendingNotification) {
    $('notification')?.classList.remove('hidden');
    chrome.storage.local.remove('pendingNotification');
  }

  // 2) Estado inicial del timer
  chrome.runtime.sendMessage({ command: 'getState' }, (state) => {
    const timerEl = $('timer');
    if (!timerEl) return;
    if (!state) {
      timerEl.textContent = '00:10'; // por defecto
      return;
    }
    const minutes = Math.floor(state.time / 60).toString().padStart(2, '0');
    const seconds = (state.time % 60).toString().padStart(2, '0');
    timerEl.textContent = `${minutes}:${seconds}`;
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

  // 6) Mostrar/ocultar sección del timer
  const timerToggle = $('toggleTimer');
  const timerSection = $('timerSection');
  const { showTimer = false } = await chrome.storage.local.get('showTimer');

  if (timerToggle) timerToggle.checked = showTimer;
  if (timerSection) {
    timerSection.classList.toggle('is-hidden', !showTimer);
  }
  timerToggle?.addEventListener('change', async function () {
    const enabled = this.checked;
    timerSection?.classList.toggle('is-hidden', !enabled);
    await chrome.storage.local.set({ showTimer: enabled });
  });

  // 7) ---- Inicializar UI de Páginas y Notas ----
  await populateCurrentTabField();   // llena #pageField con la pestaña actual
  $('savePageBtn')?.addEventListener('click', saveCurrentPage);
  $('saveNoteBtn')?.addEventListener('click', saveNoteForCurrentPage);
  await renderSavedList();           // pinta lista guardada si existe #savedList
});

// Actualizaciones del background (timer y notificación)
chrome.runtime.onMessage.addListener((message) => {
  if (message.timer && $('timer')) {
    $('timer').textContent = message.timer;
  }
  if (message.showNotification) {
    $('notification')?.classList.remove('hidden');
  }
});

// ===================
// Páginas + Notas
// ===================

// Rellena el input #pageField con "Título - URL" de la pestaña activa
async function populateCurrentTabField() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const pageField = $('pageField');

  if (tab && pageField) {
    const { title = '', url = '' } = tab;
    pageField.value = `${title} - ${url}`;
    // Guarda metadata para reusar sin volver a consultar
    pageField.dataset.title = title;
    pageField.dataset.url = url;
  }
}

// Helpers de storage
async function getSavedPages() {
  const { savedPages = [] } = await chrome.storage.local.get('savedPages');
  return savedPages;
}
async function setSavedPages(pages) {
  await chrome.storage.local.set({ savedPages: pages });
}

// Guarda SOLO la página actual (sin nota / nota vacía)
async function saveCurrentPage() {
  // lee de los data-* del input, si no existen vuelve a consultar
  let title = $('pageField')?.dataset.title || '';
  let url = $('pageField')?.dataset.url || '';
  if (!url) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) return;
    title = tabs[0].title || '';
    url = tabs[0].url || '';
  }

  let pages = await getSavedPages();
  const idx = pages.findIndex(p => p.url === url);

  if (idx === -1) {
    pages.unshift({ title, url, note: '', ts: Date.now() });
  } else {
    // si ya existe, solo actualiza el título
    pages[idx].title = title;
  }

  await setSavedPages(pages);
  await renderSavedList();
}

// Guarda/actualiza la NOTA para la página actual
async function saveNoteForCurrentPage() {
  const note = ($('noteField')?.value || '').trim();
  // leer metadata del input
  let title = $('pageField')?.dataset.title || '';
  let url = $('pageField')?.dataset.url || '';
  if (!url) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) return;
    title = tabs[0].title || '';
    url = tabs[0].url || '';
  }

  let pages = await getSavedPages();
  const idx = pages.findIndex(p => p.url === url);

  if (idx === -1) {
    pages.unshift({ title, url, note, ts: Date.now() });
  } else {
    pages[idx].note = note;
    pages[idx].title = title; // por si cambió el título
  }

  await setSavedPages(pages);
  await renderSavedList();
}

// Pinta la lista de páginas guardadas si existe #savedList en el HTML
async function renderSavedList() {
  const listEl = $('savedList'); // opcional
  if (!listEl) return; // si no está en el HTML, no hacemos nada

  const pages = await getSavedPages();
  listEl.innerHTML = '';

  pages.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'note';
    row.innerHTML = `
      <div class="notesContainer">
        <input type="text" value="${p.title} - ${p.url}" readonly />
        <textarea readonly>${p.note || ''}</textarea>
      </div>
      <button class="kebab" data-index="${i}" aria-label="Eliminar">🗑️</button>
    `;
    // eliminar
    row.querySelector('button.kebab').addEventListener('click', async (ev) => {
      const idx = Number(ev.currentTarget.dataset.index);
      const cur = await getSavedPages();
      cur.splice(idx, 1);
      await setSavedPages(cur);
      renderSavedList();
    });
    listEl.appendChild(row);
  });
}
