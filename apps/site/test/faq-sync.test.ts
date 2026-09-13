import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')

describe('site FAQ — AI assistant', () => {
  it('the visible FAQ mentions the AI assistant', () => {
    expect(html).toContain("C'è un assistente AI?")
    expect(html).toMatch(/assistente AI configura l'evento/i)
  })
  it('the JSON-LD FAQPage stays valid JSON and includes the AI question', () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(m).toBeTruthy()
    const data = JSON.parse(m![1])
    const json = JSON.stringify(data)
    expect(json).toContain("C'è un assistente AI?")
  })
})
