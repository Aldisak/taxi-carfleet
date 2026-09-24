// Client behaviour for the contact form (ContactForm.astro): copy-number button
// with clipboard + range-selection fallback, required-field validation, and a
// toast. The submit is a demo stub — wire to POST /api/v1/public/leads before
// launch.
//
// Authored as a standalone module (imported by the component's processed
// <script>) so Astro bundles it into an external same-origin /_astro/*.js file —
// CSP-safe under `script-src 'self'`. Messages are read from the `.contact`
// element's `data-contact-messages` attribute (JSON) instead of `define:vars`.

interface ContactMessages {
  sending: string
  ok: string
  err: string
  req: string
  copied: string
  copyFail: string
}

const root = document.querySelector<HTMLElement>('.contact')
const raw = root?.dataset.contactMessages

if (raw) {
  const MSG = JSON.parse(raw) as ContactMessages

  const toast = (text: string): void => {
    const el = document.createElement('div')
    el.className = 'toast'
    el.textContent = text
    el.setAttribute('role', 'status')
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 2200)
  }

  const copyBtn = document.getElementById('copy-phone')
  const num = document.getElementById('phone-number')
  if (copyBtn && num) {
    copyBtn.addEventListener('click', () => {
      const text = num.textContent ?? ''
      const fallback = (): void => {
        const r = document.createRange()
        r.selectNodeContents(num)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(r)
        toast(MSG.copyFail)
      }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => toast(MSG.copied), fallback)
      } else {
        fallback()
      }
    })
  }

  const form = document.getElementById('contact-form') as HTMLFormElement | null
  const msg = document.getElementById('form-msg')
  const submit = document.getElementById('f-submit') as HTMLButtonElement | null
  const nameEl = document.getElementById('f-name') as HTMLInputElement | null
  const phoneEl = document.getElementById('f-phone') as HTMLInputElement | null

  if (form && msg && submit && nameEl && phoneEl) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const name = nameEl.value.trim()
      const phone = phoneEl.value.trim()
      msg.hidden = false
      nameEl.setAttribute('aria-invalid', String(!name))
      phoneEl.setAttribute('aria-invalid', String(!phone))
      if (!name || !phone) {
        msg.className = 'callout err'
        msg.textContent = MSG.req
        ;(name ? phoneEl : nameEl).focus()
        return
      }
      const label = submit.textContent
      submit.textContent = MSG.sending
      submit.disabled = true
      // Demo shell: wire to POST /api/v1/public/leads before launch.
      setTimeout(() => {
        msg.className = 'callout ok'
        msg.textContent = MSG.ok
        submit.textContent = label
        submit.disabled = false
        form.reset()
      }, 600)
    })
  }
}

export {}
