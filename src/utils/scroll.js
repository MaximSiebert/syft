export function setupScrollHide() {
  let lastScrollY = window.scrollY
  let ticking = false

  window.addEventListener('scroll', () => {
    if (ticking) return
    ticking = true

    requestAnimationFrame(() => {
      const currentScrollY = window.scrollY
      const delta = currentScrollY - lastScrollY

      const atBottom = window.innerHeight + currentScrollY >= document.documentElement.scrollHeight - 10

      const dropdownOpen = document.getElementById('list-picker-dropdown')?.classList.contains('hidden') === false
      const inputFocused = document.activeElement?.id === 'add-item-input'

      if (atBottom || delta < -5) {
        document.body.classList.remove('scroll-hidden')
      } else if (delta > 5 && currentScrollY > 60 && !dropdownOpen && !inputFocused) {
        document.body.classList.add('scroll-hidden')
      }

      lastScrollY = currentScrollY
      ticking = false
    })
  })
}
