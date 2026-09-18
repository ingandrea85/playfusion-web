import { describe, it, expect } from 'vitest'
import { renderCreateEvent } from '../src/views/create-event'
import type { SportProfile } from '@playfusion/rest-client'

const sports: SportProfile[] = []

// The AI assistant (o13) is hidden behind AI_ASSISTANT_ENABLED until its public release.
// The panel + interaction code stay in create-event.ts, but must not render in the UI.
describe('create-event AI assistant panel (hidden pending release)', () => {
  it('does not render the assistant panel even when entitled', () => {
    const html = renderCreateEvent([], sports, true)
    expect(html).not.toContain('Assistente AI')
    expect(html).not.toContain('id="pf-ai-desc"')
    expect(html).not.toContain('id="pf-ai-go"')
    expect(html).not.toContain('id="pf-ai-out"')
  })
  it('does not render the locked teaser when not entitled', () => {
    const html = renderCreateEvent([], sports, false)
    expect(html).not.toContain('Assistente AI')
    expect(html).not.toContain('Disponibile con Club')
    expect(html).not.toContain('id="pf-ai-desc"')
  })
})
