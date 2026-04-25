;(function () {
  function mountFeedbackWidget() {
    if (document.querySelector('.feedback-widget')) return

    const root = document.createElement('div')
    root.className = 'feedback-widget'
    root.innerHTML = `
      <button type="button" class="feedback-widget__button" aria-expanded="false">Feedback</button>
      <div class="feedback-widget__panel" hidden>
        <div class="feedback-widget__title">Share feedback</div>
        <div class="feedback-widget__subtitle">Tell us what worked, what broke, or what should change.</div>
        <label class="feedback-widget__field">
          <span class="feedback-widget__label">Name</span>
          <input class="feedback-widget__input" name="name" maxlength="60" placeholder="Your name">
        </label>
        <label class="feedback-widget__field">
          <span class="feedback-widget__label">Content</span>
          <textarea class="feedback-widget__textarea" name="content" maxlength="3000" placeholder="Write your feedback here..." required></textarea>
        </label>
        <div class="feedback-widget__actions">
          <button type="button" class="feedback-widget__submit" disabled>Send</button>
          <button type="button" class="feedback-widget__cancel">Close</button>
        </div>
        <div class="feedback-widget__status" aria-live="polite"></div>
      </div>
    `

    document.body.appendChild(root)

    const button = root.querySelector('.feedback-widget__button')
    const panel = root.querySelector('.feedback-widget__panel')
    const nameInput = root.querySelector('.feedback-widget__input')
    const contentInput = root.querySelector('.feedback-widget__textarea')
    const submitButton = root.querySelector('.feedback-widget__submit')
    const cancelButton = root.querySelector('.feedback-widget__cancel')
    const status = root.querySelector('.feedback-widget__status')

    function setOpen(open) {
      panel.hidden = !open
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) {
        if (!nameInput.value) {
          try {
            const profile = JSON.parse(localStorage.getItem('moveit_profile') || 'null')
            if (profile?.name) nameInput.value = profile.name
          } catch {}
        }
        setTimeout(() => contentInput.focus(), 0)
      }
    }

    function setStatus(message, kind) {
      status.textContent = message || ''
      status.className = `feedback-widget__status${kind ? ` ${kind}` : ''}`
    }

    function syncSubmitState() {
      submitButton.disabled = !contentInput.value.trim()
    }

    async function submitFeedback() {
      const content = contentInput.value.trim()
      if (!content) {
        setStatus('Please enter feedback content before sending.', 'error')
        syncSubmitState()
        return
      }

      submitButton.disabled = true
      submitButton.textContent = 'Sending...'
      setStatus('')

      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: nameInput.value.trim(),
            content,
            page: location.pathname.replace(/^\//, '') || 'index.html',
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to send feedback')
        }

        contentInput.value = ''
        syncSubmitState()
        setStatus('Feedback sent. Thank you.', 'success')
        setTimeout(() => setOpen(false), 900)
      } catch (error) {
        setStatus(error.message || String(error), 'error')
      } finally {
        submitButton.textContent = 'Send'
        syncSubmitState()
      }
    }

    button.addEventListener('click', () => setOpen(panel.hidden))
    cancelButton.addEventListener('click', () => setOpen(false))
    contentInput.addEventListener('input', syncSubmitState)
    contentInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitFeedback()
    })
    submitButton.addEventListener('click', submitFeedback)

    document.addEventListener('click', (event) => {
      if (panel.hidden) return
      if (!root.contains(event.target)) setOpen(false)
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false)
    })

    syncSubmitState()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountFeedbackWidget, { once: true })
  } else {
    mountFeedbackWidget()
  }
})()
