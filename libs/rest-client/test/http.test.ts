import { describe, it, expect, vi } from 'vitest'
import { request } from '../src/http'
import { RestError } from '../src/errors'
import { bearer } from '../src/auth'

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('request()', () => {
  it('GETs the baseUrl+path and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([{ sportEventId: 'e1' }]))
    const out = await request({ baseUrl: 'https://api/prod', fetch: fetchMock }, 'GET', '/o3/events')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o3/events')
    expect(init.method).toBe('GET')
    expect(out).toEqual([{ sportEventId: 'e1' }])
  })

  it('attaches auth, org and correlation headers and JSON body on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }, 201))
    await request(
      { baseUrl: 'https://api/prod', fetch: fetchMock, auth: () => bearer('tok'), orgId: 'org-x', correlationId: () => 'cid-1' },
      'POST', '/o3/events', { sport: 'calcio' },
    )
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers['authorization']).toBe('Bearer tok')
    expect(init.headers['x-organization-id']).toBe('org-x')
    expect(init.headers['x-correlation-id']).toBe('cid-1')
    expect(init.headers['content-type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ sport: 'calcio' }))
  })

  it('throws RestError carrying status + backend code on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ error: 'EventNotFound' }, 404))
    await expect(request({ baseUrl: 'https://api/prod', fetch: fetchMock }, 'GET', '/o3/events/x'))
      .rejects.toMatchObject({ status: 404, code: 'EventNotFound' } satisfies Partial<RestError>)
  })
})
