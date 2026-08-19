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

  it('createEvent POSTs the full competition config when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'new', status: 'Published' }, 201))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const input = {
      sport: 'Calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' },
      name: 'Torneo', location: 'Rivalta', startTime: '09:00',
      tieBreak: ['HEAD_TO_HEAD' as const], playbook: 'PB-2' as const,
    }
    await c.o3.createEvent(input)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input)
  })
})

describe('o3 gironi (S8)', () => {
  it('getGironi GETs /o3/events/:id/gironi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ U10: { groups: [{ label: 'Girone A', teams: ['A'] }], locked: false } }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o3.getGironi('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o3/events/e1/gironi')
    expect(out.U10.groups[0].teams).toEqual(['A'])
  })

  it('drawGironi POSTs categoria + groupsCount to /gironi:draw', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ groups: [{ label: 'Girone A', teams: ['A'] }], locked: false }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o3.drawGironi('e1', 'U10', 2)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o3/events/e1/gironi:draw')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ categoria: 'U10', groupsCount: 2 })
  })

  it('saveGironi PUTs groups + locked to /gironi/:categoria', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ groups: [], locked: true }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const groups = [{ label: 'Girone A', teams: ['A', 'B'] }]
    await c.o3.saveGironi('e1', 'U10', groups, true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o3/events/e1/gironi/U10')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ groups, locked: true })
  })
})

describe('o3 finals config (S12)', () => {
  const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  it('updateFinalsConfig PUTs to /o3/events/:id/finals-config', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r({ finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 2 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o3.updateFinalsConfig('e1', { finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 2 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o3/events/e1/finals-config')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 2 })
    expect(out.finalsType).toBe('SPLIT_GROUP_FINALS')
  })
})

describe('o7 getMatches carries finals (S12)', () => {
  const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  it('getMatches passes through phase/bracket/resolved fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r([{ id: 'fm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Tabellone', day: 'd', time: 't', field: 'f', home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'Finale', order: 1, homeResolved: 'A' }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.getMatches('e1')
    expect(out[0].phase).toBe('FINAL')
    expect(out[0].round).toBe('Finale')
    expect(out[0].homeResolved).toBe('A')
  })
})
