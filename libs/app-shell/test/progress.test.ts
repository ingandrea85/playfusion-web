// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackActivity, withPending, __resetProgress } from '../src/progress'

const barOn = () => document.querySelector('.pf-progress.pf-progress--on')

describe('top progress bar', () => {
  beforeEach(() => { vi.useFakeTimers(); __resetProgress() })
  afterEach(() => { __resetProgress(); vi.useRealTimers() })

  it('does NOT show for a fast call (settles before the reveal delay)', () => {
    trackActivity(1)
    vi.advanceTimersByTime(50) // faster than the 120ms reveal delay
    trackActivity(-1)
    vi.advanceTimersByTime(200)
    expect(barOn()).toBeNull() // no flicker for warm calls
  })

  it('shows a climbing bar for a slow call, then completes when in-flight returns to 0', () => {
    trackActivity(1)
    vi.advanceTimersByTime(130) // past the reveal delay
    expect(barOn()).not.toBeNull()
    trackActivity(-1)
    vi.advanceTimersByTime(300) // completion + fade
    expect(barOn()).toBeNull()
  })

  it('stays visible while any request is in flight (ref-counted)', () => {
    trackActivity(1); trackActivity(1)
    vi.advanceTimersByTime(130)
    expect(barOn()).not.toBeNull()
    trackActivity(-1) // one still in flight
    vi.advanceTimersByTime(300)
    expect(barOn()).not.toBeNull()
    trackActivity(-1) // now zero
    vi.advanceTimersByTime(300)
    expect(barOn()).toBeNull()
  })
})

describe('withPending', () => {
  beforeEach(() => { vi.useRealTimers() })
  it('sets a pending state on the button during the action and restores it after', async () => {
    const btn = document.createElement('button')
    let resolve!: () => void
    const p = withPending(btn, () => new Promise<void>((r) => { resolve = r }))
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(btn.classList.contains('pf-btn--loading')).toBe(true)
    resolve(); await p
    expect(btn.disabled).toBe(false)
    expect(btn.hasAttribute('aria-busy')).toBe(false)
    expect(btn.classList.contains('pf-btn--loading')).toBe(false)
  })
  it('restores the button even when the action throws', async () => {
    const btn = document.createElement('button')
    await expect(withPending(btn, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(btn.disabled).toBe(false)
    expect(btn.classList.contains('pf-btn--loading')).toBe(false)
  })
})
