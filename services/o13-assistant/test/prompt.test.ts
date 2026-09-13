import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/prompt.js'

describe('buildPrompt', () => {
  it('embeds the description and demands strict JSON with the two allowed shapes', () => {
    const p = buildPrompt({ description: '24 squadre U10, 3 campi' })
    expect(p).toContain('24 squadre U10, 3 campi')
    expect(p).toContain('"draft"')
    expect(p).toContain('"openQuestions"')
    expect(p).toMatch(/festival/i)          // lists the allowed formats
    expect(p).toContain('groupsByCategory')  // documents the structural (teamCount) contract
  })
  it('includes prior answers when re-submitted', () => {
    const p = buildPrompt({ description: 'festa', answers: { pools: '4 pool da 6' } })
    expect(p).toContain('4 pool da 6')
  })
  it('names the pre-selected sport when provided', () => {
    expect(buildPrompt({ description: 'x', sportId: 'rugby' })).toContain('rugby')
  })
})
