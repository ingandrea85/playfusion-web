// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { entitlements } from '@playfusion/entitlements'
import type { Subscription } from '@playfusion/rest-client'
import { renderSubscription, subscriptionScreen } from '../src/views/subscription'
import { renderCapBlocked, createEventScreen } from '../src/views/create-event'

const sub = (over: Partial<Subscription> = {}): Subscription =>
  ({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-09-15', trialDaysLeft: 14, ...over })

describe('renderSubscription', () => {
  it('trial shows days left and the Attiva Club CTA', () => {
    const html = renderSubscription(sub())
    expect(html).toContain('Prova Club')
    expect(html).toContain('14')
    expect(html).toContain('id="activate-club"')
    expect(html).toContain('id="activate-starter"')
    expect(html).toContain('id="expire-trial"')
  })
  it('free shows the plan and no expire lever; paid cards offer upgrade', () => {
    const html = renderSubscription(sub({ plan: 'FREE', status: 'ACTIVE', trialDaysLeft: 0 }))
    expect(html).toContain('Piano gratuito limitato')
    expect(html).not.toContain('id="expire-trial"')
    expect(html).toContain('id="activate-club"')
    expect(html).toContain('id="activate-starter"')
  })
  it('active Club marks Club as the current plan (no upgrade button)', () => {
    const html = renderSubscription(sub({ plan: 'CLUB', status: 'ACTIVE', trialDaysLeft: 0 }))
    expect(html).toContain('Piano attuale')
    expect(html).not.toContain('id="activate-club"')
  })
})

describe('subscription mount', () => {
  it('Attiva Club calls activatePlan(CLUB) and refreshes', async () => {
    const o11 = { activatePlan: vi.fn().mockResolvedValue({}), expireTrial: vi.fn().mockResolvedValue({}) }
    const refresh = vi.fn()
    const ctx = { client: { o11 } as any, orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh }
    const root = document.createElement('div'); root.innerHTML = renderSubscription(sub())
    subscriptionScreen.mount!(root, ctx as any, { sub: sub() })
    root.querySelector<HTMLButtonElement>('#activate-club')!.click()
    await vi.waitFor(() => expect(o11.activatePlan).toHaveBeenCalledWith('org-1', 'CLUB'))
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
  })
  it('Attiva Starter calls activatePlan(STARTER)', async () => {
    const o11 = { activatePlan: vi.fn().mockResolvedValue({}), expireTrial: vi.fn().mockResolvedValue({}) }
    const ctx = { client: { o11 } as any, orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn() }
    const root = document.createElement('div'); root.innerHTML = renderSubscription(sub())
    subscriptionScreen.mount!(root, ctx as any, { sub: sub() })
    root.querySelector<HTMLButtonElement>('#activate-starter')!.click()
    await vi.waitFor(() => expect(o11.activatePlan).toHaveBeenCalledWith('org-1', 'STARTER'))
  })
})

describe('create-event Free cap (from entitlements)', () => {
  const capCtx = (plan: 'FREE' | 'CLUB', events: unknown[]) =>
    ({ client: { o3: { listEvents: vi.fn().mockResolvedValue(events), listSports: vi.fn().mockResolvedValue([]) } }, orgId: 'org-1', entitlements: entitlements(plan) }) as any
  it('caps a FREE org that already has an event', async () => {
    const data = await createEventScreen.load(capCtx('FREE', [{ sportEventId: 'e1' }]), {})
    expect(data.capReached).toBe(true)
    expect(createEventScreen.render(data)).toContain('Hai raggiunto il limite del piano Free')
  })
  it('does not cap a CLUB org (unlimited events)', async () => {
    expect((await createEventScreen.load(capCtx('CLUB', [{ sportEventId: 'e1' }, { sportEventId: 'e2' }]), {})).capReached).toBe(false)
  })
  it('does not cap a FREE org with no events yet', async () => {
    expect((await createEventScreen.load(capCtx('FREE', []), {})).capReached).toBe(false)
  })
})

describe('renderCapBlocked', () => {
  it('links to the subscription page', () => {
    expect(renderCapBlocked()).toContain('#/org/subscription')
  })
})
