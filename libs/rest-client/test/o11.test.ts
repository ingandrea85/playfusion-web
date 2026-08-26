import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const sub = { organizationId: 'org-pilot', plan: 'PRO', status: 'TRIAL', renewsOn: '2026-09-15', trialDaysLeft: 14 }

describe('o11 subscription api (S20)', () => {
  it('getSubscription GETs the subscription', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(sub))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o11.getSubscription('org-pilot')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/org-pilot/subscription')
    expect(out.trialDaysLeft).toBe(14)
  })
  it('activatePro POSTs to subscription:activate-pro', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ ...sub, plan: 'PRO', status: 'ACTIVE', trialDaysLeft: 0 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o11.activatePro('org-pilot')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/org-pilot/subscription:activate-pro')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
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
