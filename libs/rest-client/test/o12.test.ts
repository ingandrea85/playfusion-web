import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o12 api', () => {
  it('listFees GETs /o12/events/:id/fees', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([{ registrationId: 'r1', status: 'Paid' }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o12.listFees('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o12/events/e1/fees')
    expect(out).toEqual([{ registrationId: 'r1', status: 'Paid' }])
  })
})
