// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { toast } from '../src/toast'

afterEach(() => { document.querySelectorAll('.pf-toasts').forEach((n) => n.remove()) })

describe('toast (E1-1)', () => {
  it('appends an ARIA-live status element and auto-dismisses after ~3s', () => {
    vi.useFakeTimers()
    toast('Salvato', 'success')
    const el = document.querySelector('.pf-toast')
    expect(el).not.toBeNull()
    expect(el!.getAttribute('role')).toBe('status')
    expect(el!.getAttribute('aria-live')).toBe('polite')
    expect(el!.textContent).toContain('Salvato')
    vi.advanceTimersByTime(3000)
    expect(document.querySelector('.pf-toast')).toBeNull()
    vi.useRealTimers()
  })

  it('is dismissible via its close button', () => {
    toast('Qualcosa', 'error')
    expect(document.querySelector('.pf-toast--error')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('.pf-toast__x')!.click()
    expect(document.querySelector('.pf-toast')).toBeNull()
  })

  it('uses textContent for the message (no HTML injection)', () => {
    toast('<b>x</b>')
    expect(document.querySelector('.pf-toast__msg')!.innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;')
  })
})
