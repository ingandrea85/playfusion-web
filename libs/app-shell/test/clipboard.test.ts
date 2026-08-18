// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { copyToClipboard } from '../src/clipboard'

describe('copyToClipboard', () => {
  it('writes text via navigator.clipboard and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    expect(await copyToClipboard('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })
  it('returns false instead of throwing when the clipboard API rejects', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    expect(await copyToClipboard('x')).toBe(false)
  })
})
