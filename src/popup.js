// Utilidad rápida
function $(id) {
  return document.getElementById(id)
}

// Variables globales
let currentNoteId = null
let currentTabUrl = ''

// ====== NOTES FUNCTIONALITY ======

// Función para cargar notas
async function loadNotes() {
  const notesList = $('notesList')
  if (!notesList) return

  // Load saved pages and migrate to origin-based storage if needed
  const { savedPages = [] } = await chrome.storage.local.get('savedPages')
  // migrate legacy entries with full URL to origin (domain) entries
  const migrated = savedPages.map((p) => {
    if (p.origin) return p
    try {
      const u = new URL(p.url)
      return { origin: u.origin, reason: p.reason, timestamp: p.timestamp, updated: p.updated }
    } catch {
      return p
    }
  })
  if (JSON.stringify(migrated) !== JSON.stringify(savedPages)) {
    await chrome.storage.local.set({ savedPages: migrated })
  }
  const pages = migrated

  notesList.innerHTML = ''
  if (pages.length === 0) {
    notesList.innerHTML = '<div class="note"><div class="note-thumb">No saved pages yet</div></div>'
    return
  }
  pages.forEach((note, index) => {
    const noteElement = document.createElement('div')
    noteElement.className = 'note'
    {
      const host = (() => {
        try { return new URL(note.origin).hostname } catch { return note.origin }
      })()
      noteElement.innerHTML = `
      <div class="note-thumb" title="${note.origin}">
        <strong>${note.reason || 'No reason provided'}</strong>
        <div class="note-url">${host}</div>
      </div>
      <button class="kebab" data-index="${index}" aria-label="note menu">…</button>
    `
    }
    notesList.appendChild(noteElement)
    // Allow opening saved page and update focus to new tab
    const thumb = noteElement.querySelector('.note-thumb')
    if (thumb) {
      thumb.addEventListener('click', () => {
        chrome.runtime.sendMessage({ command: 'openSavedPage', url: note.origin })
        window.close()
      })
    }
  })

  // Add event listeners to kebab buttons
  document.querySelectorAll('.kebab').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = e.target.getAttribute('data-index')
      const note = pages[index]
      showNoteMenu(index, note.origin, note.reason)
    })
  })
}

// Función para mostrar menú de nota (updated to include reason)
function showNoteMenu(index, origin, reason) {
  currentNoteId = index
  const modal = $('noteMenuModal')
  if (modal) {
    // Update the modal to include update option
    const modalContent = modal.querySelector('.modal-content')
    if (modalContent) {
      modalContent.innerHTML = `
        <h3>PAGE OPTIONS</h3>
        <p class="note-url">${origin}</p>
        <div class="modal-buttons-vertical">
          <button id="updateReason" class="update-btn">UPDATE REASON</button>
          <button id="removePage" class="remove-btn">REMOVE PAGE</button>
          <button id="cancelNoteMenu" class="cancel-btn">CANCEL</button>
        </div>
      `

      // Add event listeners for the new buttons
      setTimeout(() => {
        const updateBtn = $('updateReason')
        const removeBtn = $('removePage')
        const cancelBtn = $('cancelNoteMenu')

        if (updateBtn) {
          updateBtn.addEventListener('click', () => showUpdateReasonModal(index, reason))
        }
        if (removeBtn) {
          removeBtn.addEventListener('click', () => showConfirmDeleteModal())
        }
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden')
            currentNoteId = null
          })
        }
      }, 0)
    }

    modal.classList.remove('hidden')
  }
}

// Función para mostrar modal de actualización de razón
function showUpdateReasonModal(index, currentReason) {
  const modal = $('updateReasonModal')
  const reasonInput = $('updateReasonText')
  if (modal && reasonInput) {
    reasonInput.value = currentReason || ''
    modal.classList.remove('hidden')

    // Store the index for updating
    currentNoteId = index
  }
}

// Función para mostrar modal de confirmación de eliminación
function showConfirmDeleteModal() {
  const modal = $('confirmDeleteModal')
  if (modal) {
    modal.classList.remove('hidden')
  }
}

// Función para actualizar la razón
async function updateReason() {
  if (currentNoteId === null) return

  const reasonInput = $('updateReasonText')
  if (!reasonInput) return

  const newReason = reasonInput.value.trim()

  try {
    const { savedPages = [] } = await chrome.storage.local.get('savedPages')
    if (currentNoteId >= 0 && currentNoteId < savedPages.length) {
      savedPages[currentNoteId].reason = newReason
      savedPages[currentNoteId].updated = Date.now()
      await chrome.storage.local.set({ savedPages })
    }

    const modal = $('updateReasonModal')
    if (modal) modal.classList.add('hidden')
    loadNotes()
  } catch (error) {
    console.error('Error updating reason:', error)
  }
}

// Función para añadir página actual
async function addCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab && tab.url) {
      currentTabUrl = tab.url
      const reasonInput = $('pageReason')
      const modal = $('addPageModal')
      if (reasonInput && modal) {
        reasonInput.value = ''
        modal.classList.remove('hidden')
      }
    }
  } catch (error) {
    console.error('Error getting current tab:', error)
  }
}

// Función para guardar página
async function savePage() {
  const reasonInput = $('pageReason')
  if (!reasonInput || !currentTabUrl) return

  const reason = reasonInput.value.trim()

  try {
    const { savedPages = [] } = await chrome.storage.local.get('savedPages')
    // Save by domain origin and prevent duplicates
    const origin = (() => {
      try { return new URL(currentTabUrl).origin } catch { return currentTabUrl }
    })()
    if (savedPages.some((p) => (p.origin || new URL(p.url).origin) === origin)) {
      alert('This domain is already saved.')
      const modal = $('addPageModal')
      if (modal) modal.classList.add('hidden')
      loadNotes()
      return
    }
    savedPages.push({
      origin,
      reason,
      timestamp: Date.now(),
    })

    await chrome.storage.local.set({ savedPages })
    const modal = $('addPageModal')
    if (modal) modal.classList.add('hidden')
    loadNotes()

    // Enable start button if this is the current page
    updateStartButtonState()
  } catch (error) {
    console.error('Error saving page:', error)
  }
}

// Función para eliminar página
async function removePage() {
  if (currentNoteId === null) return

  try {
    const { savedPages = [] } = await chrome.storage.local.get('savedPages')
    if (currentNoteId >= 0 && currentNoteId < savedPages.length) {
      savedPages.splice(currentNoteId, 1)
      await chrome.storage.local.set({ savedPages })
    }

    const modal = $('confirmDeleteModal')
    if (modal) modal.classList.add('hidden')

    const noteMenuModal = $('noteMenuModal')
    if (noteMenuModal) noteMenuModal.classList.add('hidden')

    currentNoteId = null
    loadNotes()

    // Update start button state
    updateStartButtonState()
  } catch (error) {
    console.error('Error removing page:', error)
  }
}

// Check if current page is saved and update start button state
async function updateStartButtonState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const { savedPages = [] } = await chrome.storage.local.get('savedPages')
  const startButton = $('start')
  const timerHint = $('timerHint')

  if (tab && tab.url && startButton && timerHint) {
    // Enable timer only on saved domain origins
    const currentOrigin = (() => {
      try { return new URL(tab.url).origin } catch { return tab.url }
    })()
    const currentPage = savedPages.find((page) => (page.origin || page.url) === currentOrigin)

    if (!currentPage || !currentPage.reason) {
      startButton.disabled = true
      startButton.title = 'Save this page with a reason first to start timer'
      startButton.style.opacity = '0.6'
      timerHint.classList.remove('hidden')
    } else {
      startButton.disabled = false
      startButton.title = ''
      startButton.style.opacity = '1'
      timerHint.classList.add('hidden')
    }
  }
}

// Event listeners para modales
function setupModalListeners() {
  // Add current page button
  const addButton = $('addCurrentPage')
  if (addButton) {
    addButton.addEventListener('click', addCurrentPage)
  }

  // Modal buttons
  const saveButton = $('savePage')
  if (saveButton) {
    saveButton.addEventListener('click', savePage)
  }

  const cancelAddButton = $('cancelAddPage')
  if (cancelAddButton) {
    cancelAddButton.addEventListener('click', () => {
      const modal = $('addPageModal')
      if (modal) modal.classList.add('hidden')
    })
  }

  // Update reason modal buttons
  const saveUpdateButton = $('saveUpdateReason')
  if (saveUpdateButton) {
    saveUpdateButton.addEventListener('click', updateReason)
  }

  const cancelUpdateButton = $('cancelUpdateReason')
  if (cancelUpdateButton) {
    cancelUpdateButton.addEventListener('click', () => {
      const modal = $('updateReasonModal')
      if (modal) modal.classList.add('hidden')
    })
  }

  // Confirm delete modal buttons
  const confirmDeleteButton = $('confirmDelete')
  if (confirmDeleteButton) {
    confirmDeleteButton.addEventListener('click', removePage)
  }

  const cancelDeleteButton = $('cancelDelete')
  if (cancelDeleteButton) {
    cancelDeleteButton.addEventListener('click', () => {
      const modal = $('confirmDeleteModal')
      if (modal) modal.classList.add('hidden')
    })
  }

  // Close modals on outside click
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden')
        currentNoteId = null
      }
    })
  })
}

// ====== TIMER AND SETTINGS FUNCTIONALITY ======

// Código principal
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded - setting up event listeners')

  // Setup modal listeners first
  setupModalListeners()

  // Load notes
  loadNotes()

  // Check if current page is saved and update start button
  updateStartButtonState()

  // 1) Mostrar notificación si el background dejó una pendiente
  const { pendingNotification } = await chrome.storage.local.get('pendingNotification')
  if (pendingNotification) {
    const notification = $('notification')
    if (notification) notification.classList.remove('hidden')
    chrome.storage.local.remove('pendingNotification')
  }

  // 2) Pintar tiempo actual del timer
  chrome.runtime.sendMessage({ command: 'getState' }, (state) => {
    const timerElement = $('timer')
    if (!timerElement) return

    if (!state) {
      timerElement.textContent = '00:10'
      return
    }
    const minutes = Math.floor(state.time / 60)
      .toString()
      .padStart(2, '0')
    const seconds = (state.time % 60).toString().padStart(2, '0')
    timerElement.textContent = `${minutes}:${seconds}`
  })

  // 3) Botones Pomodoro
  const startButton = $('start')
  if (startButton) {
    startButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ command: 'start' })
      const resetButton = $('reset')
      if (resetButton) resetButton.disabled = false
    })
  }

  const stopButton = $('stop')
  if (stopButton) {
    stopButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ command: 'stop' })
    })
  }

  const resetButton = $('reset')
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ command: 'reset' })
    })
  }

  // 4) Botones de notificación
  const startBreakButton = $('startBreak')
  if (startBreakButton) {
    startBreakButton.addEventListener('click', () => {
      const notification = $('notification')
      if (notification) notification.classList.add('hidden')
      chrome.runtime.sendMessage({ command: 'startBreak' })
    })
  }

  const skipBreakButton = $('skipBreak')
  if (skipBreakButton) {
    skipBreakButton.addEventListener('click', () => {
      const notification = $('notification')
      if (notification) notification.classList.add('hidden')
      chrome.runtime.sendMessage({ command: 'skipBreak' })
    })
  }

  // 5) Toggle OpenDyslexic GLOBAL
  const toggleOD = $('toggleOpenDyslexic')
  if (toggleOD) {
    const { odGlobal = false } = await chrome.storage.local.get('odGlobal')
    toggleOD.checked = !!odGlobal

    toggleOD.addEventListener('change', async (e) => {
      const enabled = e.target.checked
      try {
        await chrome.runtime.sendMessage({ command: 'setODGlobal', enabled })
      } catch (err) {
        console.error('Error al aplicar OpenDyslexic global:', err)
        toggleOD.checked = !enabled
      }
    })
  }

  // 6) Timer toggle persistence
  const timerToggle = $('toggleTimer')
  const timerSection = $('timerSection')

  if (timerToggle && timerSection) {
    const { showTimer = false } = await chrome.storage.local.get('showTimer')
    timerToggle.checked = showTimer

    if (showTimer) {
      timerSection.classList.remove('is-hidden')
    } else {
      timerSection.classList.add('is-hidden')
    }

    timerToggle.addEventListener('change', async function () {
      const enabled = this.checked
      if (enabled) {
        timerSection.classList.remove('is-hidden')
      } else {
        timerSection.classList.add('is-hidden')
      }
      await chrome.storage.local.set({ showTimer: enabled })
    })
  }
})

// Listener para actualizaciones en tiempo real desde el background
chrome.runtime.onMessage.addListener((message) => {
  if (message.timer) {
    const timerElement = $('timer')
    if (timerElement) timerElement.textContent = message.timer
  }
  if (message.showNotification) {
    const notification = $('notification')
    if (notification) notification.classList.remove('hidden')
  }
})
