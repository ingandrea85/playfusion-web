// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { entitlements } from '@playfusion/entitlements'
import { setOrgNavOwner, renderOrgShell } from '../src/views/org'
import { membersScreen } from '../src/views/members'
import { brandScreen } from '../src/views/brand'
import { subscriptionScreen } from '../src/views/subscription'
import type { ViewCtx } from '../src/view'

// Reset the session-constant nav flag after each test so ordering can't leak state.
afterEach(() => setOrgNavOwner(true))

const ctx = (role: 'OWNER' | 'ORGANIZER'): ViewCtx => ({
  client: {
    o1: { getBrand: async () => null },
    o2: { listMembers: async () => [], listInvitations: async () => [] },
    o11: { getSubscription: async () => ({ organizationId: 'o', plan: 'PRO', status: 'TRIAL', renewsOn: '', trialDaysLeft: 7 }) },
  } as any,
  orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh: () => {},
  isPlatformAdmin: false, orgRole: role, entitlements: entitlements('PRO'),
})

describe('org nav role-gating', () => {
  it('OWNER sees all org tabs', () => {
    setOrgNavOwner(true)
    const html = renderOrgShell('overview', 'x')
    for (const t of ['Panoramica', 'Membri', 'Brand', 'Abbonamento']) expect(html).toContain(t)
  })
  it('ORGANIZER sees only Panoramica', () => {
    setOrgNavOwner(false)
    const html = renderOrgShell('overview', 'x')
    expect(html).toContain('Panoramica')
    for (const t of ['Membri', 'Brand', 'Abbonamento']) expect(html).not.toContain(`>${t}</a>`)
  })
})

describe('owner-only screens deny ORGANIZER', () => {
  it('Membri: ORGANIZER load is forbidden and never calls the API', async () => {
    const c = ctx('ORGANIZER')
    const data = await membersScreen.load(c, {})
    expect(data).toMatchObject({ forbidden: true })
    expect(membersScreen.render(data)).toMatch(/riservato all'owner/)
  })
  it('Brand: ORGANIZER load is forbidden', async () => {
    const data = await brandScreen.load(ctx('ORGANIZER'), {})
    expect(data).toMatchObject({ forbidden: true })
    expect(brandScreen.render(data)).toMatch(/riservato all'owner/)
  })
  it('Abbonamento: ORGANIZER load is forbidden', async () => {
    const data = await subscriptionScreen.load(ctx('ORGANIZER'), {})
    expect(data).toMatchObject({ forbidden: true })
    expect(subscriptionScreen.render(data)).toMatch(/riservato all'owner/)
  })
  it('Membri: OWNER load fetches and renders the editor', async () => {
    const data = await membersScreen.load(ctx('OWNER'), {})
    expect(data.forbidden).toBeUndefined()
    expect(membersScreen.render(data)).toContain('id="i-invite"')
  })
})
