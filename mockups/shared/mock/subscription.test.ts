import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getSubscription, setSubscriptionPlan, setSubscriptionStatus } from './store'
import { planPrice } from './plans'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('subscription', () => {
  it('seeds one subscription per org', () => {
    expect(getSubscription('org-1')?.plan).toBe('PRO')
    expect(getSubscription('org-3')?.status).toBe('PAST_DUE')
    expect(getSubscription('org-2')?.status).toBe('TRIAL')
  })

  it('setSubscriptionPlan changes plan (and thus derived price)', () => {
    setSubscriptionPlan('org-2', 'BUSINESS')
    expect(getSubscription('org-2')?.plan).toBe('BUSINESS')
    expect(planPrice(getSubscription('org-2')!.plan)).toBe(29)
  })

  it('setSubscriptionStatus changes status', () => {
    setSubscriptionStatus('org-3', 'ACTIVE')
    expect(getSubscription('org-3')?.status).toBe('ACTIVE')
  })

  it('planPrice: FREE 0, PRO 19, BUSINESS 29', () => {
    expect(planPrice('FREE')).toBe(0)
    expect(planPrice('PRO')).toBe(19)
    expect(planPrice('BUSINESS')).toBe(29)
  })
})
