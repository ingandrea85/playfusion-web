import { describe, it, expect } from 'vitest'
import { workspaceTabs } from '../src/views/workspace'

describe('workspaceTabs — festival', () => {
  it('festival hides standings and finals, keeps calendario + risorse, and shows a "Pool" tab (slice B)', () => {
    const tabs = workspaceTabs({ sportEventId: 'e', format: 'festival' })
    const keys = tabs.map((t) => t.key)
    expect(keys).not.toContain('standings')
    expect(keys).not.toContain('finals')
    expect(keys).toContain('schedule')
    expect(keys).toContain('resources')
    expect(tabs.find((t) => t.key === 'gironi')?.label).toBe('Pool') // gironi kept, relabelled Pool
  })
  it('bracket still hides only gironi + standings (finals kept)', () => {
    const keys = workspaceTabs({ sportEventId: 'e', format: 'bracket' }).map((t) => t.key)
    expect(keys).not.toContain('gironi')
    expect(keys).not.toContain('standings')
    expect(keys).toContain('finals')
  })
})
