import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
import type { ScheduleConfig } from '../src/types'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const config: ScheduleConfig = { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' }

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
