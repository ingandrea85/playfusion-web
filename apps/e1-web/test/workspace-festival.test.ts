import { describe, it, expect } from 'vitest'
import { workspaceTabs } from '../src/views/workspace'

describe('workspaceTabs — festival', () => {
  it('festival hides gironi, standings and finals; keeps calendario + risorse', () => {
    const keys = workspaceTabs({ sportEventId: 'e', format: 'festival' }).map((t) => t.key)
    expect(keys).not.toContain('gironi')
    expect(keys).not.toContain('standings')
    expect(keys).not.toContain('finals')
    expect(keys).toContain('schedule')
    expect(keys).toContain('resources')
  })
  it('bracket still hides only gironi + standings (finals kept)', () => {
    const keys = workspaceTabs({ sportEventId: 'e', format: 'bracket' }).map((t) => t.key)
    expect(keys).not.toContain('gironi')
    expect(keys).not.toContain('standings')
    expect(keys).toContain('finals')
  })
})
