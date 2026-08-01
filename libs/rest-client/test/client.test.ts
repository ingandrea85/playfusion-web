import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

it('o2.verify sends the passed token as bearer, ignoring the client auth', async () => {
  const fetchMock = vi.fn().mockResolvedValue(res({ subject: 's', roles: [] }))
  const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock, auth: () => ({ name: 'authorization', value: 'Bearer client-token' }) })
  await c.o2.verify('link-token')
  expect(fetchMock.mock.calls[0][1].headers['authorization']).toBe('Bearer link-token')
})
