import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const ann = { announcementId: 'x1', sportEventId: 'e1', categoryId: null, title: 'T', body: 'B', pinned: false, source: 'ORGANIZER', createdAt: 't' }

describe('o9 api (S15)', () => {
  it('listAnnouncements GETs /o9/events/:id/announcements', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([ann]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o9.listAnnouncements('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o9/events/e1/announcements')
    expect(out[0].announcementId).toBe('x1')
  })

  it('publishAnnouncement POSTs the input to /o9/events/:id/announcements', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(ann, 201))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const input = { categoryId: 'U10', title: 'Cambio campo', body: 'Campo B', pinned: true }
    await c.o9.publishAnnouncement('e1', input)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o9/events/e1/announcements')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(input)
  })

  it('deleteAnnouncement DELETEs /o9/announcements/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o9.deleteAnnouncement('x1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o9/announcements/x1')
    expect(init.method).toBe('DELETE')
  })

  it('setPin POSTs {pinned} to /o9/announcements/:id/pin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ ...ann, pinned: true }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o9.setPin('x1', true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o9/announcements/x1/pin')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ pinned: true })
    expect(out.pinned).toBe(true)
  })
})
