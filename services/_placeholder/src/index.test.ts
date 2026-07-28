import { describe, it, expect } from 'vitest'
import { placeholder } from './index'

describe('@playfusion/service-placeholder', () => {
  it('marks the services layer as a temporary S0.1 scaffold', () => {
    expect(placeholder).toBe('service')
  })
})
