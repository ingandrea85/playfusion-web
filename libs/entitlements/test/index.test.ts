import { describe, it, expect } from 'vitest'
import { entitlements, atEventCap } from '../src/index.js'

describe('entitlements', () => {
  it('FREE is the restricted solo plan', () => {
    expect(entitlements('FREE')).toMatchObject({ maxSeats: 1, canInviteMembers: false, maxActiveEvents: 1, hasBrand: false, hasAnnouncements: false, hasPayments: false, hasEventSite: false, hasFinalsFormats: false, hasResources: false })
  })
  it('STARTER unlocks core tournament (unlimited events, finals formats) but no differentiators', () => {
    expect(entitlements('STARTER')).toMatchObject({ maxSeats: 3, canInviteMembers: true, maxActiveEvents: null, hasAnnouncements: true, hasFinalsFormats: true, hasBrand: false, hasPayments: false, hasEventSite: false, hasResources: false, hasBusinessFeatures: false })
  })
  it('CLUB unlocks the differentiators (payments, brand, event site, resources)', () => {
    expect(entitlements('CLUB')).toMatchObject({ maxSeats: 5, canInviteMembers: true, maxActiveEvents: null, hasBrand: true, hasAnnouncements: true, hasPayments: true, hasEventSite: true, hasFinalsFormats: true, hasResources: true, hasBusinessFeatures: false })
  })
  it('ENTERPRISE adds seats + the business-only feature flag', () => {
    expect(entitlements('ENTERPRISE')).toMatchObject({ maxSeats: 20, hasBusinessFeatures: true })
  })
  it('an unknown/missing plan falls back to FREE', () => {
    expect(entitlements(undefined)).toEqual(entitlements('FREE'))
    expect(entitlements('WHATEVER')).toEqual(entitlements('FREE'))
  })
})

describe('atEventCap', () => {
  it('FREE caps at 1 active event', () => {
    expect(atEventCap('FREE', 0)).toBe(false)
    expect(atEventCap('FREE', 1)).toBe(true)
  })
  it('STARTER/CLUB/ENTERPRISE never cap', () => {
    expect(atEventCap('STARTER', 99)).toBe(false)
    expect(atEventCap('CLUB', 99)).toBe(false)
    expect(atEventCap('ENTERPRISE', 500)).toBe(false)
  })
})
