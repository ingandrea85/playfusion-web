import { describe, it, expect } from 'vitest'
import { placeholder } from './index'

describe('@playfusion/infra-placeholder', () => {
  it('marks the infra layer as a temporary S0.1 scaffold', () => {
    expect(placeholder).toBe('infra')
  })
})
