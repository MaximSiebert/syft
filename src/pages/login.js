import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../lib/auth.js'
import { getSession } from '../lib/auth.js'
import { showToast, setLoading } from '../utils/ui.js'

async function init() {
  const session = await getSession()
  if (session) {
    window.location.href = '/explore.html'
    return
  }

  document.getElementById('google-btn')?.addEventListener('click', async () => {
    try {
      await signInWithGoogle()
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  const form = document.getElementById('email-form')
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const submitBtn = form.querySelector('button[type="submit"]')
    const email = form.email.value
    const password = form.password.value
    const isSignUp = form.dataset.mode === 'signup'

    setLoading(submitBtn, true)
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password)
        showToast('Check your email to confirm your account', 'success')
      } else {
        await signInWithEmail(email, password)
        window.location.href = '/explore.html'
      }
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setLoading(submitBtn, false)
    }
  })

  document.getElementById('toggle-mode')?.addEventListener('click', () => {
    const form = document.getElementById('email-form')
    const isSignUp = form.dataset.mode === 'signup'
    form.dataset.mode = isSignUp ? 'signin' : 'signup'

    document.getElementById('submit-btn').textContent = isSignUp ? 'Sign in' : 'Sign up'
    document.getElementById('toggle-mode').textContent = isSignUp
      ? "Don't have an account? Sign up"
      : 'Already have an account? Sign in'
  })

  document.body.classList.add('ready')
}

init()
