import { describe, it, expect } from 'vitest'
import { placeholder } from './index'

describe('@playfusion/lib-placeholder', () => {
  it('marks the libs layer as a temporary S0.1 scaffold', () => {
    expect(placeholder).toBe('lib')
  })
})
