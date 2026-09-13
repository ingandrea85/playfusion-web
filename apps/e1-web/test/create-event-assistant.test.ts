import { describe, it, expect } from 'vitest'
import { renderCreateEvent } from '../src/views/create-event'
import type { SportProfile } from '@playfusion/rest-client'

const sports: SportProfile[] = []

describe('create-event AI assistant panel', () => {
  it('renders the assistant panel with input + button when entitled', () => {
    const html = renderCreateEvent([], sports, true)
    expect(html).toContain('Assistente AI')
    expect(html).toContain('id="pf-ai-desc"')
    expect(html).toContain('id="pf-ai-go"')
    expect(html).toContain('id="pf-ai-out"')
  })
  it('renders a locked teaser (no input) when not entitled', () => {
    const html = renderCreateEvent([], sports, false)
    expect(html).toContain('Assistente AI')
    expect(html).toContain('Disponibile con Club')
    expect(html).not.toContain('id="pf-ai-desc"')
  })
})
