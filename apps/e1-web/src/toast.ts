/** E1-1: a self-contained success/error toast. No app-shell dependency — appends an ARIA-live
 *  element to <body>, auto-hides after ~3s, and is dismissible. Injects its own minimal styles once
 *  (so it works even before any e1 stylesheet loads). Respects prefers-reduced-motion. */
let stylesInjected = false

function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const style = document.createElement('style')
  style.id = 'pf-toast-styles'
  style.textContent = `
.pf-toasts { position: fixed; z-index: 9999; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 8px; max-width: min(92vw, 380px); }
.pf-toast { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18); font-size: 14px; font-weight: 600; color: #fff; background: var(--color-feedback-success, #0f9d6b); animation: pf-toast-in .18s ease-out; }
.pf-toast--error { background: var(--color-feedback-danger, #d1435b); }
.pf-toast__msg { flex: 1 1 auto; }
.pf-toast__x { flex: 0 0 auto; background: transparent; border: 0; color: inherit; font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; opacity: .8; }
.pf-toast__x:hover { opacity: 1; }
@keyframes pf-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .pf-toast { animation: none; } }
`
  document.head.appendChild(style)
}

/** Show a transient toast. `kind` selects success (default) or error styling. */
export function toast(message: string, kind: 'success' | 'error' = 'success'): void {
  if (typeof document === 'undefined') return
  injectStyles()
  let host = document.querySelector<HTMLElement>('.pf-toasts')
  if (!host) {
    host = document.createElement('div')
    host.className = 'pf-toasts'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = `pf-toast pf-toast--${kind}`
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')

  const msg = document.createElement('span')
  msg.className = 'pf-toast__msg'
  msg.textContent = message
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'pf-toast__x'
  close.setAttribute('aria-label', 'Chiudi')
  close.textContent = '✕'
  el.append(msg, close)
  host.appendChild(el)

  const remove = () => { el.remove(); if (host && !host.childElementCount) host.remove() }
  const timer = setTimeout(remove, 3000)
  close.addEventListener('click', () => { clearTimeout(timer); remove() })
}
