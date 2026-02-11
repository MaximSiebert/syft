export function showToast(message, type = 'info') {
  const toast = document.createElement('div')
  toast.className = 'fixed bottom-0 right-0 left-0 w-full h-[70px] px-4 py-6 bg-white/40 backdrop-blur-lg w-full font-medium text-sm text-center z-50 transition-all duration-300'
  toast.style.transform = 'trangrayY(100%)'
  toast.style.opacity = '0'
  toast.textContent = message
  document.body.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.transform = 'trangrayY(0)'
    toast.style.opacity = '1'
  })

  setTimeout(() => {
    toast.style.transform = 'trangrayY(100%)'
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-white p-6 max-w-sm mx-4 border">
        <p class="mb-4">${escapeHtml(message)}</p>
        <div class="flex justify-end gap-2">
          <button class="px-4 py-2 border" data-action="cancel">Cancel</button>
          <button class="px-4 py-2 border" data-action="confirm">Confirm</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action
      if (action === 'confirm') {
        resolve(true)
        modal.remove()
      } else if (action === 'cancel' || e.target === modal) {
        resolve(false)
        modal.remove()
      }
    })
  })
}

export function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-white p-6 max-w-sm mx-4 w-full border">
        <p class="mb-4">${escapeHtml(message)}</p>
        <input type="text" class="w-full px-3 py-2 border mb-4" value="${escapeHtml(defaultValue)}" autofocus>
        <div class="flex justify-end gap-2">
          <button class="px-4 py-2 border" data-action="cancel">Cancel</button>
          <button class="px-4 py-2 border" data-action="confirm">OK</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    const input = modal.querySelector('input')
    input.focus()
    input.select()

    const handleAction = (action) => {
      if (action === 'confirm') {
        const value = input.value.trim()
        resolve(value || null)
        modal.remove()
      } else {
        resolve(null)
        modal.remove()
      }
    }

    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action
      if (action) handleAction(action)
      else if (e.target === modal) handleAction('cancel')
    })

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAction('confirm')
      if (e.key === 'Escape') handleAction('cancel')
    })
  })
}

export function inlineConfirm(btn, confirmText = 'Click again to delete') {
  if (btn.dataset.confirming === 'true') {
    clearTimeout(Number(btn.dataset.confirmTimer))
    document.removeEventListener('click', btn._outsideHandler)
    delete btn.dataset.confirming
    return true
  }

  const originalHtml = btn.innerHTML
  btn.dataset.confirming = 'true'
  btn.textContent = confirmText
  btn.classList.remove('text-gray-300')
  btn.classList.add('text-gray-800')

  const reset = () => {
    btn.innerHTML = originalHtml
    btn.classList.remove('text-gray-800')
    btn.classList.add('text-gray-300')
    delete btn.dataset.confirming
    document.removeEventListener('click', btn._outsideHandler)
  }

  const timer = setTimeout(reset, 5000)
  btn.dataset.confirmTimer = timer

  btn._outsideHandler = (e) => {
    if (!btn.contains(e.target)) reset()
  }
  setTimeout(() => document.addEventListener('click', btn._outsideHandler), 0)

  return false
}

export function setLoading(button, isLoading) {
  if (isLoading) {
    button.disabled = true
    button.dataset.originalHtml = button.innerHTML
    button.innerHTML = `<svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
    </svg>`
  } else {
    button.disabled = false
    button.innerHTML = button.dataset.originalHtml || button.innerHTML
  }
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
