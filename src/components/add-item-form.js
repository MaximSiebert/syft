import { getLists, createList, addItemToList, addTextItemToList } from '../lib/db.js'
import { showToast } from '../utils/ui.js'

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export async function initAddItemForm({ defaultListId, onItemAdded, onListCreated } = {}) {
  const shouldAnimate = !Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k))

  // Inject form HTML
  document.body.insertAdjacentHTML('beforeend', `
    <form id="add-item-form" class="fixed bottom-0 lg:right-8 right-4 lg:left-8 left-4 pb-3 z-20 bg-gray-50 sm:rounded-t-[25px] rounded-t-md"${shouldAnimate ? ' style="transform:translateY(100%)"' : ''}>
      <div class="relative shadow-lg bg-white sm:rounded-full rounded-md flex flex-wrap items-center border border-gray-200 hover:border-gray-300 transition-colors group">
        <div class="relative grow sm:w-auto w-full">
          <input type="text" id="add-item-input" placeholder="Paste a URL or write something short..." required
            class="w-full text-ellipsis bg-transparent px-3 py-3 text-sm transition-colors h-12 sm:border-0 border-b border-gray-200 group-hover:border-gray-300 outline-none">
          <span id="char-counter" class="hidden absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none"></span>
        </div>
        <div class="sm:relative sm:min-w-72 sm:grow-0 grow text-ellipsis">
          <button type="button" id="list-picker-btn" class="w-full bg-transparent px-3 py-3 text-sm text-left transition-colors h-12 border-l-0 border-r-0 outline-none truncate cursor-pointer flex items-center justify-between gap-2">
            <span id="list-picker-label" class="truncate">Select list</span>
            <svg id="list-picker-arrow" class="shrink-0 transition-transform duration-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.6 -0.6 12 12" height="12" width="12">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M0.54 2.97 5.01768 7.668a0.54 0.54 0 0 0 0.76464 0L10.260000000000002 2.97" stroke-width="1.2"></path>
            </svg>
          </button>
          <div id="list-picker-dropdown" class="group hidden absolute bottom-full mb-[1px] pb-1 sm:bg-transparent bg-gray-50 rounded-t-md left-[-1px] sm:right-auto right-[-1px] sm:w-full">
            <div class="bg-white border border-gray-200 group-hover:border-gray-300 transition-colors rounded-md overflow-hidden">
              <input type="text" id="list-picker-search" placeholder="Search lists..." class="h-12 w-full px-3 py-2 text-sm border-b border-gray-200 group-hover:border-gray-300 transition-colors outline-none">
              <div id="list-picker-items" class="overflow-y-auto max-h-[196px] py-2"></div>
              <button type="button" id="list-picker-create" class="h-12 w-full px-3 py-2 text-sm text-left border-t border-gray-200 group-hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer">
                New list +
              </button>
            </div>
          </div>
        </div>
        <div class="w-10 pr-2 h-12 flex items-center justify-center rounded-r-full">
          <button type="submit" class="text-sm block text-[#fafafa] bg-orange-500 hover:bg-orange-600 transition-colors w-8 h-8 flex shrink-0 justify-center items-center rounded-full cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.6 -0.6 12 12" height="12" width="12">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.4 0.54v9.72" stroke-width="1.2"></path>
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M0.54 5.4h9.72" stroke-width="1.2"></path>
            </svg>
          </button>
        </div>
      </div>
    </form>
  `)

  const form = document.getElementById('add-item-form')
  const addInput = document.getElementById('add-item-input')
  const charCounter = document.getElementById('char-counter')
  const TEXT_MAX = 65

  function isUrl(val) {
    return /^https?:\/\//i.test(val)
  }

  addInput.addEventListener('input', () => {
    const val = addInput.value
    if (isUrl(val)) {
      charCounter.classList.add('hidden')
      addInput.removeAttribute('maxlength')
    } else if (val.length > 0) {
      addInput.setAttribute('maxlength', TEXT_MAX)
      charCounter.textContent = `${val.length}/${TEXT_MAX}`
      charCounter.classList.remove('hidden')
    } else {
      charCounter.classList.add('hidden')
      addInput.removeAttribute('maxlength')
    }
  })

  const btn = document.getElementById('list-picker-btn')
  const label = document.getElementById('list-picker-label')
  const arrow = document.getElementById('list-picker-arrow')
  const dropdown = document.getElementById('list-picker-dropdown')
  const searchInput = document.getElementById('list-picker-search')
  const itemsContainer = document.getElementById('list-picker-items')
  const createBtn = document.getElementById('list-picker-create')

  let userLists = []
  let selectedListId = null
  let pendingListName = null
  let focusedIndex = -1

  try {
    userLists = await getLists()
  } catch {
    userLists = []
  }

  // Pre-select: explicit defaultListId > last used from localStorage > first list
  if (defaultListId) {
    selectedListId = defaultListId
    const list = userLists.find(l => l.id === defaultListId)
    if (list) label.textContent = list.name
  } else if (userLists.length > 0) {
    const lastUsedId = localStorage.getItem('syft_last_list_id')
    const lastUsed = lastUsedId && userLists.find(l => l.id === lastUsedId)
    if (lastUsed) {
      selectedListId = lastUsed.id
      label.textContent = lastUsed.name
    } else {
      selectedListId = userLists[0].id
      label.textContent = userLists[0].name
    }
  } else {
    label.textContent = 'Create your first list'
    arrow.classList.add('hidden')
  }

  function getItems() {
    return itemsContainer.querySelectorAll('button')
  }

  function updateFocus() {
    getItems().forEach((item, i) => {
      if (i === focusedIndex) {
        item.classList.add('bg-gray-100')
      } else {
        item.classList.remove('bg-gray-100')
      }
    })
  }

  function selectItem(item) {
    selectedListId = item.dataset.listId
    const list = userLists.find(l => l.id === selectedListId)
    if (list) label.textContent = list.name
    closeDropdown()
  }

  function renderItems(filter = '') {
    const filtered = filter
      ? userLists.filter(l => l.name.toLowerCase().includes(filter.toLowerCase()))
      : userLists

    focusedIndex = -1

    itemsContainer.innerHTML = filtered.map(l =>
      `<button type="button" class="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors cursor-pointer truncate ${l.id === selectedListId ? 'font-medium text-gray-800' : 'text-gray-500'}" data-list-id="${l.id}">${escapeHtml(l.name)}</button>`
    ).join('')

    getItems().forEach(item => {
      item.addEventListener('click', () => selectItem(item))
    })
  }

  function openDropdown() {
    dropdown.classList.remove('hidden')
    arrow.classList.add('rotate-180')
    form.classList.remove('rounded-t-md')
    searchInput.value = ''
    renderItems()
    if (window.innerWidth >= 640) searchInput.focus()
  }

  function closeDropdown() {
    dropdown.classList.add('hidden')
    arrow.classList.remove('rotate-180')
    form.classList.add('rounded-t-md')
    searchInput.value = ''
    focusedIndex = -1
  }

  function startInlineCreate() {
    if (btn.dataset.creating === 'true') return
    btn.dataset.creating = 'true'

    label.classList.add('hidden')
    arrow.classList.add('hidden')

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'List name...'
    input.className = 'w-full h-full bg-transparent outline-none text-sm'
    if (pendingListName) input.value = pendingListName
    btn.appendChild(input)
    input.focus()

    const confirm = () => {
      const name = input.value.trim()
      if (!name) {
        pendingListName = null
        label.textContent = 'Create your first list'
      } else {
        pendingListName = name
        label.textContent = name
      }
      input.remove()
      label.classList.remove('hidden')
      if (userLists.length > 0) arrow.classList.remove('hidden')
      delete btn.dataset.creating
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        pendingListName = null
        label.textContent = 'Create your first list'
        input.remove()
        label.classList.remove('hidden')
        if (userLists.length > 0) arrow.classList.remove('hidden')
        delete btn.dataset.creating
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        confirm()
      }
    })

    input.addEventListener('blur', () => confirm())
  }

  btn.addEventListener('click', () => {
    if (userLists.length === 0) {
      startInlineCreate()
      return
    }
    if (dropdown.classList.contains('hidden')) {
      openDropdown()
    } else {
      closeDropdown()
    }
  })

  searchInput.addEventListener('input', () => {
    renderItems(searchInput.value)
  })

  searchInput.addEventListener('keydown', (e) => {
    const items = getItems()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1)
      updateFocus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusedIndex = Math.max(focusedIndex - 1, -1)
      updateFocus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedIndex >= 0 && items[focusedIndex]) {
        selectItem(items[focusedIndex])
      }
    } else if (e.key === 'Escape') {
      closeDropdown()
    }
  })

  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
      closeDropdown()
    }
  })

  // Create new list inline
  createBtn.addEventListener('click', () => {
    if (createBtn.dataset.expanding === 'true') return

    const originalText = createBtn.textContent
    createBtn.dataset.expanding = 'true'

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'List name...'
    input.className = 'w-full h-full bg-transparent outline-none text-sm'
    createBtn.textContent = ''
    createBtn.appendChild(input)
    input.focus()

    const reset = () => {
      createBtn.textContent = originalText
      delete createBtn.dataset.expanding
    }

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        reset()
        return
      }
      if (e.key !== 'Enter') return
      const name = input.value.trim()
      if (!name) { reset(); return }

      input.disabled = true
      try {
        const list = await createList(name)
        userLists.unshift({ ...list, list_items: [{ count: 0 }], preview_items: [] })
        selectedListId = list.id
        label.textContent = list.name
        reset()
        closeDropdown()
        if (onListCreated) onListCreated(list.id)
      } catch (error) {
        showToast(error.message, 'error')
        reset()
      }
    })

    input.addEventListener('blur', () => reset())
  })

  // Form submit
  const submitBtn = form.querySelector('button[type="submit"]')
  const plusIcon = submitBtn.innerHTML

  const spinnerIcon = `<svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
    <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
  </svg>`

  const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="-0.6 -0.6 12 12" height="12" width="12">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M1.35 5.4l2.7 2.7 5.4-5.4" stroke-width="1.2"></path>
  </svg>`

  // Slide form into view on first login
  if (shouldAnimate) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        form.style.transform = ''
      })
    })
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const value = addInput.value.trim()

    if (!value || (!selectedListId && !pendingListName)) return

    submitBtn.disabled = true
    submitBtn.innerHTML = spinnerIcon
    try {
      if (!selectedListId && pendingListName) {
        const list = await createList(pendingListName)
        userLists.unshift({ ...list, list_items: [{ count: 0 }], preview_items: [] })
        selectedListId = list.id
        pendingListName = null
        label.textContent = list.name
        arrow.classList.remove('hidden')
        if (onListCreated) onListCreated(list.id)
      }

      if (isUrl(value)) {
        await addItemToList(value, selectedListId)
      } else {
        await addTextItemToList(value, selectedListId)
      }
      localStorage.setItem('syft_last_list_id', selectedListId)
      submitBtn.innerHTML = checkIcon
      addInput.value = ''
      charCounter.classList.add('hidden')
      addInput.removeAttribute('maxlength')
      if (onItemAdded) onItemAdded(selectedListId)
      setTimeout(() => {
        submitBtn.innerHTML = plusIcon
        submitBtn.disabled = false
      }, 1500)
    } catch (error) {
      showToast(error.message, 'error')
      submitBtn.innerHTML = plusIcon
      submitBtn.disabled = false
    }
  })
}
