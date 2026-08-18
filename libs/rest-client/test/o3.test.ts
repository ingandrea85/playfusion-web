import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o3 api', () => {
  it('listEvents GETs /o3/events', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([{ sportEventId: 'e', sport: 's', categorie: [], dates: { from: 'a', to: 'b' }, status: 'Published' }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o3.listEvents()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o3/events')
    expect(out[0].sportEventId).toBe('e')
  })

  it('getEvent GETs /o3/events/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'e42', sport: 's', categorie: [], dates: { from: 'a', to: 'b' }, status: 'Published' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o3.getEvent('e42')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o3/events/e42')
    expect(out.sportEventId).toBe('e42')
  })

  it('createEvent POSTs /o3/events with the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'new', status: 'Published' }, 201))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o3.createEvent({ sport: 'calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o3/events')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ sport: 'calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' } })
  })
})
