import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
import type { ScheduleConfig } from '../src/types'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const config: ScheduleConfig = { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }

describe('o7 api', () => {
  it('getSchedule GETs /o7/events/:id/schedule', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'e1', organizationId: 'org', status: 'NONE', config }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.getSchedule('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o7/events/e1/schedule')
    expect(out.status).toBe('NONE')
  })

  it('getMatches GETs /o7/events/:id/matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([{ id: 'sm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'B' }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.getMatches('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o7/events/e1/matches')
    expect(out[0].id).toBe('sm-1')
  })

  it('generateSchedule POSTs the config to /o7/events/:id/schedule:generate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'e1', organizationId: 'org', status: 'GENERATED', config }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.generateSchedule('e1', config)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o7/events/e1/schedule:generate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(config)
    expect(out.status).toBe('GENERATED')
  })

  it('approveSchedule and publishSchedule POST the status transitions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ sportEventId: 'e1', organizationId: 'org', status: 'APPROVED', config }))
      .mockResolvedValueOnce(res({ sportEventId: 'e1', organizationId: 'org', status: 'PUBLISHED', config }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    expect((await c.o7.approveSchedule('e1')).status).toBe('APPROVED')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o7/events/e1/schedule:approve')
    expect((await c.o7.publishSchedule('e1')).status).toBe('PUBLISHED')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api/prod/o7/events/e1/schedule:publish')
  })
})

describe('o7 reschedule (S9)', () => {
  it('rescheduleMatch PUTs the patch to /o7/events/:id/matches/:matchId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ id: 'sm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-08-30', time: '10:00', field: 'Campo B', home: 'A', away: 'B' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const patch = { day: '2026-08-30', time: '10:00', field: 'Campo B' }
    const out = await c.o7.rescheduleMatch('e1', 'sm-1', patch)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o7/events/e1/matches/sm-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual(patch)
    expect(out.time).toBe('10:00')
  })

  it('propagates a 409 slot conflict as a RestError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 'SLOT_CONFLICT', message: 'taken' }, 409))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await expect(c.o7.rescheduleMatch('e1', 'sm-1', { day: 'd', time: 't', field: 'f' })).rejects.toMatchObject({ status: 409, code: 'SLOT_CONFLICT' })
  })
})

describe('o7 per-category config (S22)', () => {
  it('generateSchedule carries byCategory through in the PUT/POST body', async () => {
    const cfgWith = { ...config, byCategory: { U14: { fields: ['Campo Grande'], periods: 2, periodMinutes: 30, breakMinutes: 5, legs: 'HOME_AWAY' as const } } }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sportEventId: 'e1', organizationId: 'o', status: 'GENERATED', config: cfgWith }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o7.generateSchedule('e1', cfgWith)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).byCategory.U14).toMatchObject({ periodMinutes: 30, legs: 'HOME_AWAY' })
  })
})

describe('o7 results + standings (S10)', () => {
  const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  it('recordResult POSTs the score to /matches/:id/result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r({ id: 'sm-1', homeScore: 3, awayScore: 1 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o7.recordResult('e1', 'sm-1', { homeScore: 3, awayScore: 1 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o7/events/e1/matches/sm-1/result')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ homeScore: 3, awayScore: 1 })
  })
  it('getStandings GETs /o7/events/:id/standings and carries unresolved/override', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r([{ categoryId: 'U10', groupLabel: 'Girone A', rows: [{ team: 'A', points: 3 }], unresolved: [['B', 'C']], override: { order: ['A'], resolvedBy: 'org', resolvedAt: 't' } }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.getStandings('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o7/events/e1/standings')
    expect(out[0].rows[0].team).toBe('A')
    expect(out[0].unresolved).toEqual([['B', 'C']])
    expect(out[0].override?.resolvedBy).toBe('org')
  })
})

describe('o7 tie-break resolution (S11)', () => {
  const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  it('setTieOverride PUTs the order, URL-encoding category and group label', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r({ order: ['Bravo', 'Alfa'], resolvedBy: 'org', resolvedAt: 't' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.setTieOverride('e1', 'U10', 'Girone A', ['Bravo', 'Alfa'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o7/events/e1/standings/U10/Girone%20A/override')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ order: ['Bravo', 'Alfa'] })
    expect(out.order).toEqual(['Bravo', 'Alfa'])
  })
})

describe('o7 director token (S25)', () => {
  it('getDirectorToken POSTs the field to /director-token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ field: 'Campo A', token: 'tok-d' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.getDirectorToken('e1', 'Campo A')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o7/events/e1/director-token')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ field: 'Campo A' })
    expect(out.token).toBe('tok-d')
  })
})

describe('o7 match lifecycle (S26)', () => {
  const match = { id: 'sm-1', sportEventId: 'e1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'Campo A', home: 'A', away: 'B', status: 'LIVE', startedAt: '2026-09-01T09:05:00.000Z' }
  it.each([
    ['startMatch', 'start'],
    ['finishMatch', 'finish'],
    ['cancelMatch', 'cancel'],
  ] as const)('%s POSTs to /matches/:id/%s', async (method, verb) => {
    const fetchMock = vi.fn().mockResolvedValue(res(match))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7[method]('e1', 'sm-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://api/prod/o7/events/e1/matches/sm-1/${verb}`)
    expect(init.method).toBe('POST')
    expect(out.status).toBe('LIVE')
  })
})

describe('o7 decide winner (draw KO)', () => {
  const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  it('decideWinner POSTs the side to /matches/:id/decide-winner', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r({ id: 'f1', decidedWinner: 'AWAY' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.decideWinner('e1', 'f1', 'AWAY')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o7/events/e1/matches/f1/decide-winner')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ winner: 'AWAY' })
    expect(out.decidedWinner).toBe('AWAY')
  })
})

describe('o7 final standings (S13)', () => {
  const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  it('getFinalStandings GETs /o7/events/:id/final-standings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r([{ categoryId: 'U10', rows: [{ position: 1, team: 'A' }, { position: 2, pending: 'tie' }] }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o7.getFinalStandings('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o7/events/e1/final-standings')
    expect(out[0].rows[0]).toEqual({ position: 1, team: 'A' })
  })
})

describe('o7 finals formats (SP1)', () => {
  const r = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
  const fmt = { id: 'f1', name: 'Secca', seeds: 2, rounds: [{ name: 'Finale', matches: [{ slot: 'F', home: { seed: 1 }, away: { seed: 2 } }] }], createdAt: 't' }
  const input = { name: 'Secca', seeds: 2, rounds: fmt.rounds }
  it('listFinalsFormats GETs /o7/finals-formats', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r([fmt]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    expect((await c.o7.listFinalsFormats())[0].id).toBe('f1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o7/finals-formats')
  })
  it('saveFinalsFormat POSTs the input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(r(fmt, 201))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o7.saveFinalsFormat(input as any)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o7/finals-formats'); expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(input)
  })
  it('updateFinalsFormat PUTs /o7/finals-formats/:id and delete DELETEs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(r(fmt)).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o7.updateFinalsFormat('f1', input as any)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o7/finals-formats/f1')
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
    await c.o7.deleteFinalsFormat('f1')
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })
})
