import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o13 assistant api', () => {
  it('draftEvent POSTs the description to assistant:draft', async () => {
    const f = vi.fn().mockResolvedValue(res({ openQuestions: [{ field: 'fields', question: 'Quanti campi?' }] }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    const out = await c.o13.draftEvent('org-1', { description: 'festa' })
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o13/organizations/org-1/assistant:draft')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ description: 'festa' })
    expect(out.openQuestions?.[0].field).toBe('fields')
  })
})
