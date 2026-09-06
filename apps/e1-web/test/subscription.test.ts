// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { entitlements } from '@playfusion/entitlements'
import type { Subscription } from '@playfusion/rest-client'
import { renderSubscription, subscriptionScreen } from '../src/views/subscription'
import { renderCapBlocked, createEventScreen } from '../src/views/create-event'

const sub = (over: Partial<Subscription> = {}): Subscription =>
  ({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-09-15', trialDaysLeft: 14, stripeCustomerId: 'cus_1', ...over })

describe('renderSubscription', () => {
  it('trial shows days left and the manage-billing CTA', () => {
    const html = renderSubscription(sub())
    expect(html).toContain('Prova Club'); expect(html).toContain('id="manage-billing"')
  })
  it('past_due shows the warning and manage CTA', () => {
    const html = renderSubscription(sub({ status: 'PAST_DUE' }))
    expect(html).toContain('Pagamento in sospeso'); expect(html).toContain('id="manage-billing"')
  })
  it('free shows no manage CTA', () => {
    const html = renderSubscription(sub({ plan: 'FREE', status: 'ACTIVE', trialDaysLeft: 0 }))
    expect(html).not.toContain('id="manage-billing"')
  })
})

describe('subscription mount', () => {
  it('manage-billing opens the portal and redirects', async () => {
    const o11 = { openBillingPortal: vi.fn().mockResolvedValue({ url: 'https://portal' }) }
    const assign = vi.fn(); Object.defineProperty(window, 'location', { value: { href: 'https://app/x', assign }, writable: true })
    const ctx = { client: { o11 } as any, orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn() }
    const root = document.createElement('div'); root.innerHTML = renderSubscription(sub())
    subscriptionScreen.mount!(root, ctx as any, { sub: sub() })
    root.querySelector<HTMLButtonElement>('#manage-billing')!.click()
    await vi.waitFor(() => expect(o11.openBillingPortal).toHaveBeenCalledWith('org-1', 'https://app/x'))
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://portal'))
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
