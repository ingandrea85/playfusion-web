import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const sub = { organizationId: 'org-pilot', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-09-15', trialDaysLeft: 14 }

describe('o11 subscription api (S20)', () => {
  it('getSubscription GETs the subscription', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(sub))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o11.getSubscription('org-pilot')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/org-pilot/subscription')
    expect(out.trialDaysLeft).toBe(14)
  })
  it('activatePlan POSTs the plan to subscription:activate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ ...sub, plan: 'CLUB', status: 'ACTIVE', trialDaysLeft: 0 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o11.activatePlan('org-pilot', 'CLUB')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/org-pilot/subscription:activate')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ plan: 'CLUB' })
    expect(out.status).toBe('ACTIVE')
  })
  it('expireTrial POSTs to subscription:expire-trial', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ ...sub, plan: 'FREE', status: 'ACTIVE', trialDaysLeft: 0 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o11.expireTrial('org-pilot')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/org-pilot/subscription:expire-trial')
    expect(out.plan).toBe('FREE')
  })
})
