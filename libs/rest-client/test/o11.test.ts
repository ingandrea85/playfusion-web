import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o11 subscription api', () => {
  it('provision POSTs to subscription:provision', async () => {
    const f = vi.fn().mockResolvedValue(res({ organizationId: 'o', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-15', trialDaysLeft: 14 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    const out = await c.o11.provision('o', 'a@b.c')
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/o/subscription:provision')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ email: 'a@b.c' })
    expect(out.status).toBe('TRIAL')
  })
  it('openBillingPortal returns the hosted url', async () => {
    const f = vi.fn().mockResolvedValue(res({ url: 'https://portal' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    const out = await c.o11.openBillingPortal('o', 'https://app/return')
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/o/subscription:portal')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ returnUrl: 'https://app/return' })
    expect(out.url).toBe('https://portal')
  })
  it('getSubscription GETs the subscription URL', async () => {
    const f = vi.fn().mockResolvedValue(res({ organizationId: 'o', plan: 'CLUB', status: 'ACTIVE', renewsOn: '2026-01-15', trialDaysLeft: 0 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    const out = await c.o11.getSubscription('o')
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/o/subscription')
    expect(f.mock.calls[0][1].method).toBe('GET')
    expect(out.plan).toBe('CLUB')
  })
  it('resync POSTs to the admin resync URL', async () => {
    const f = vi.fn().mockResolvedValue(res({ organizationId: 'o', plan: 'CLUB', status: 'ACTIVE', renewsOn: '2026-01-15', trialDaysLeft: 0 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    await c.o11.resync('o')
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o11/admin/organizations/o/subscription:resync')
    expect(f.mock.calls[0][1].method).toBe('POST')
  })
})
