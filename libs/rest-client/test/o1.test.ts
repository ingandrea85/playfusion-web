import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const brand = { logoText: 'Acme Cup', primaryColor: '#0b5fff', accentColor: '#ff6b00' }

describe('o1 api (S18 brand)', () => {
  it('getBrand GETs /o1/organizations/:orgId/brand', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(brand))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o1.getBrand('org-pilot')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o1/organizations/org-pilot/brand')
    expect(out).toEqual(brand)
  })

  it('getBrand returns null when the tenant has no brand', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(null))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    expect(await c.o1.getBrand('org-pilot')).toBeNull()
  })

  it('setBrand PUTs the brand', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(brand))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o1.setBrand('org-pilot', brand)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o1/organizations/org-pilot/brand')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual(brand)
  })

  it('resetBrand DELETEs the brand', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o1.resetBrand('org-pilot')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o1/organizations/org-pilot/brand')
    expect(init.method).toBe('DELETE')
  })
})
