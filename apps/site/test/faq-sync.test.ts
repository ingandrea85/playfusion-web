import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')

// The AI assistant is hidden from the marketing site until its public release
// (see AI_ASSISTANT_ENABLED in e1-web/create-event.ts). The visible FAQ entry is
// commented out and the JSON-LD entry removed, so nothing advertises it.
describe('site FAQ — AI assistant hidden pending release', () => {
  it('the visible FAQ does not advertise the AI assistant', () => {
    // strip HTML comments so a commented-out (dormant) entry does not count as visible
    const visible = html.replace(/<!--[\s\S]*?-->/g, '')
    expect(visible).not.toContain("C'è un assistente AI?")
    expect(visible).not.toMatch(/assistente AI configura l'evento/i)
  })
  it('the JSON-LD FAQPage stays valid JSON and omits the AI question', () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(m).toBeTruthy()
    const data = JSON.parse(m![1])
    expect(JSON.stringify(data)).not.toContain("assistente AI")
  })
})
