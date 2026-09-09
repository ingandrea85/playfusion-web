/** Loading feedback for slow (cold-start) serverless calls. Two pieces:
 *  - a global top progress bar, ref-counted, driven by the rest-client's `onActivity` hook;
 *  - `withPending`, a per-button spinner for mutation actions.
 *
 *  The bar shows only after a short delay so fast/warm calls don't flicker, climbs asymptotically
 *  while requests are in flight, and completes when the in-flight count returns to 0. SSR-safe. */

let active = 0
let bar: HTMLDivElement | null = null
let showTimer: ReturnType<typeof setTimeout> | undefined
let climbTimer: ReturnType<typeof setInterval> | undefined
let width = 0

function el(): HTMLDivElement | null {
  if (typeof document === 'undefined' || !document.body) return null
  if (bar && bar.isConnected) return bar
  bar = document.createElement('div')
  bar.className = 'pf-progress'
  bar.setAttribute('role', 'progressbar')
  bar.setAttribute('aria-hidden', 'true')
  document.body.appendChild(bar)
  return bar
}

function setWidth(w: number): void { width = w; const b = el(); if (b) b.style.width = `${w}%` }

function show(): void {
  const b = el(); if (!b) return
  b.classList.add('pf-progress--on')
  setWidth(8)
  climbTimer = setInterval(() => { if (active > 0) setWidth(Math.min(90, width + (90 - width) * 0.1 + 0.5)) }, 250)
}

function finish(): void {
  if (climbTimer) { clearInterval(climbTimer); climbTimer = undefined }
  const b = el(); if (!b) return
  setWidth(100)
  setTimeout(() => { b.classList.remove('pf-progress--on'); setWidth(0) }, 250)
}

/** A request started. */
export function beginActivity(): void {
  active++
  if (active === 1 && !showTimer && !climbTimer) {
    showTimer = setTimeout(() => { showTimer = undefined; show() }, 120)
  }
}

/** A request settled. */
export function endActivity(): void {
  active = Math.max(0, active - 1)
  if (active > 0) return
  if (showTimer) { clearTimeout(showTimer); showTimer = undefined; return } // never shown (fast call) → nothing to finish
  if (climbTimer || bar?.classList.contains('pf-progress--on')) finish()
}

/** Wire into `createClient({ onActivity: trackActivity })`. */
export function trackActivity(delta: 1 | -1): void { if (delta === 1) beginActivity(); else endActivity() }

/** Run an async action with a visible pending state on `btn`: disabled + aria-busy + a spinner,
 *  restored when the action settles (even on error). Returns the action's result. */
export async function withPending<T>(btn: HTMLButtonElement, fn: () => Promise<T>): Promise<T> {
  const wasDisabled = btn.disabled
  btn.disabled = true
  btn.setAttribute('aria-busy', 'true')
  btn.classList.add('pf-btn--loading')
  try { return await fn() }
  finally {
    btn.classList.remove('pf-btn--loading')
    btn.removeAttribute('aria-busy')
    btn.disabled = wasDisabled
  }
}

/** Test-only: reset the module's global state between tests. */
export function __resetProgress(): void {
  if (showTimer) clearTimeout(showTimer)
  if (climbTimer) clearInterval(climbTimer)
  showTimer = climbTimer = undefined
  active = 0; width = 0
  if (bar) { bar.remove(); bar = null }
}
