import { describe, it, expect } from 'vitest'
import { resolveEventSite, hasSiteContent } from '../src/site'
import type { OrgSiteDefaults, EventSite } from '../src/types'

const org: OrgSiteDefaults = {
  about: 'Org about',
  venue: { name: 'Sede abituale', address: 'Via Org 1', mapUrl: 'https://maps/org' },
  contacts: { email: 'info@org.it' },
  sponsors: [{ name: 'Rossi Sport', url: 'https://rossi' }, { name: 'Caffè' }],
}

describe('resolveEventSite', () => {
  it('inherits org fields when the event does not override them', () => {
    const r = resolveEventSite(org, { program: 'Ven 15:00…' })
    expect(r.about).toBe('Org about')
    expect(r.venue?.name).toBe('Sede abituale')
    expect(r.contacts?.email).toBe('info@org.it')
    expect(r.program).toBe('Ven 15:00…')
    expect(r.enabled).toBe(true)
  })
  it('event overrides win when present (empty string still overrides)', () => {
    const e: EventSite = { about: 'Event about', venue: { name: 'Campo evento' } }
    const r = resolveEventSite(org, e)
    expect(r.about).toBe('Event about')
    expect(r.venue?.name).toBe('Campo evento')
    // an explicit empty string is an override, not inherit
    expect(resolveEventSite(org, { about: '' }).about).toBe('')
  })
  it('appends org sponsors + event sponsors by default', () => {
    const r = resolveEventSite(org, { sponsors: [{ name: 'Farmacia' }] })
    expect(r.sponsors.map((s) => s.name)).toEqual(['Rossi Sport', 'Caffè', 'Farmacia'])
  })
  it('drops org sponsors when inheritOrgSponsors is false', () => {
    const r = resolveEventSite(org, { inheritOrgSponsors: false, sponsors: [{ name: 'Solo evento' }] })
    expect(r.sponsors.map((s) => s.name)).toEqual(['Solo evento'])
  })
  it('handles null org / null event', () => {
    expect(resolveEventSite(null, null)).toEqual({ enabled: true, tagline: undefined, about: undefined, program: undefined, venue: undefined, contacts: undefined, sponsors: [] })
    expect(resolveEventSite(null, { tagline: 'x' }).tagline).toBe('x')
  })
  it('enabled=false only when the event explicitly disables it', () => {
    expect(resolveEventSite(org, { enabled: false }).enabled).toBe(false)
    expect(resolveEventSite(org, {}).enabled).toBe(true)
  })
})

describe('hasSiteContent', () => {
  it('true when any showcase field resolves', () => {
    expect(hasSiteContent(resolveEventSite(org, {}))).toBe(true) // org about/venue/sponsors
    expect(hasSiteContent(resolveEventSite(null, { tagline: 'Solo tagline' }))).toBe(true)
  })
  it('false for an empty site or an explicitly disabled one', () => {
    expect(hasSiteContent(resolveEventSite(null, null))).toBe(false)
    expect(hasSiteContent(resolveEventSite(org, { enabled: false }))).toBe(false)
  })
})
