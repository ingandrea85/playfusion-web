import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getBrand, setBrand, resolveBrand, signUp, expireTrial } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

const B = { logoText: 'ASD Aurora', primaryColor: '#123456', accentColor: '#abcdef' }

describe('brand store', () => {
  it('setBrand/getBrand persist on an org', () => {
    setBrand('org-1', B)
    expect(getBrand('org-1')).toEqual(B)
  })

  it('resolveBrand returns the brand when org has M-Broadcast + brand', () => {
    // org-1 seed modules include M-Broadcast
    setBrand('org-1', B)
    expect(resolveBrand('org-1')).toEqual(B)
  })

  it('resolveBrand is null when no brand set', () => {
    expect(resolveBrand('org-1')).toBeNull()
  })

  it('resolveBrand is null without M-Broadcast, even if a brand is saved', () => {
    // org-2 seed modules = M-Core + M-Compete only
    setBrand('org-2', B)
    expect(getBrand('org-2')).toEqual(B)      // saved…
    expect(resolveBrand('org-2')).toBeNull()  // …but gated off
  })

  it('losing M-Broadcast (trial expiry) gates the brand off', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org Brand' })
    setBrand(organization.id, B)
    expect(resolveBrand(organization.id)).toEqual(B) // PRO trial has M-Broadcast
    expireTrial(organization.id)                      // modules → core+compete
    expect(resolveBrand(organization.id)).toBeNull()
  })
})
