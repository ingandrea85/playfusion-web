// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HashRouter } from '../src/router'

beforeEach(() => { window.location.hash = '' })

describe('HashRouter', () => {
  it('dispatches the matching route with extracted params', () => {
    const spy = vi.fn()
    const r = new HashRouter().on('#/events/:id', spy).on('#/', () => {})
    r.start()
    window.location.hash = '#/events/abc'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(spy).toHaveBeenCalledWith({ id: 'abc' })
  })
  it('falls back to #/ when nothing matches', () => {
    const home = vi.fn()
    const r = new HashRouter().on('#/', home)
    r.start() // hash '' normalizes to '#/'
    expect(home).toHaveBeenCalled()
  })
})
