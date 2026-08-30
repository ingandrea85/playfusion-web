import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('S21 admin client methods', () => {
  it('o2.adminListOrgs / adminGetOrg hit the admin routes', async () => {
    const f = vi.fn().mockResolvedValueOnce(res([{ id: 'o1', name: 'Acme', memberCount: 3 }])).mockResolvedValueOnce(res({ id: 'o1', name: 'Acme', members: [] }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    expect((await c.o2.adminListOrgs())[0].memberCount).toBe(3)
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o2/admin/organizations')
    await c.o2.adminGetOrg('org 1')
    expect(f.mock.calls[1][0]).toBe('https://api/prod/o2/admin/organizations/org%201')
  })
  it('o11.adminSetPlan PUTs the plan', async () => {
    const f = vi.fn().mockResolvedValue(res({ organizationId: 'o1', plan: 'BUSINESS', status: 'ACTIVE', renewsOn: '2026-10-01', trialDaysLeft: 0 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    await c.o11.adminSetPlan('o1', { plan: 'BUSINESS' })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api/prod/o11/admin/organizations/o1/subscription')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ plan: 'BUSINESS' })
  })
  it('o3.adminOrgEvents GETs the org events', async () => {
    const f = vi.fn().mockResolvedValue(res([]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    await c.o3.adminOrgEvents('o1')
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o3/admin/organizations/o1/events')
  })
})
