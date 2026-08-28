// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { seedHtml } from '../src/views/rich-editor'

describe('seedHtml (Quill seed)', () => {
  it('converts legacy plain-text newlines to <br> and escapes entities', () => {
    expect(seedHtml('a\nb\nc')).toBe('a<br>b<br>c')
    expect(seedHtml('Tom & Jerry\nfine')).toBe('Tom &amp; Jerry<br>fine')
  })
  it('leaves already-HTML content untouched', () => {
    expect(seedHtml('<p><strong>x</strong></p>')).toBe('<p><strong>x</strong></p>')
  })
  it('handles empty', () => {
    expect(seedHtml('')).toBe('')
  })
})
