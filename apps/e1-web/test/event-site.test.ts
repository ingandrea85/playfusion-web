// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { entitlements } from '@playfusion/entitlements'
import type { EventDetail, OrgSiteDefaults } from '@playfusion/rest-client'
import { renderEventSite, eventSiteScreen, collectEventSite } from '../src/views/event-site'
import type { ViewCtx } from '../src/view'

const event: EventDetail = {
  sportEventId: 'e1', organizationId: 'org-1', sport: 'Calcio', categorie: ['U10'],
  dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1', name: 'Coppa',
}
const org: OrgSiteDefaults = { about: 'Org about', venue: { name: 'Sede org' }, sponsors: [{ name: 'Rossi' }] }

const ctx = (over: Partial<ViewCtx> = {}, ev: EventDetail = event): ViewCtx => ({
  client: {
    o3: { getEvent: vi.fn().mockResolvedValue(ev), setEventSite: vi.fn().mockResolvedValue({}) },
    o1: { getSite: vi.fn().mockResolvedValue(org) },
  } as any,
  orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn(),
  isPlatformAdmin: false, orgRole: 'OWNER', entitlements: entitlements('PRO'), ...over,
})

const mounted = async (c: ViewCtx) => {
  const data = await eventSiteScreen.load(c, { id: 'e1' })
  const root = document.createElement('div'); root.innerHTML = renderEventSite(data)
  eventSiteScreen.mount!(root, c, data)
  return root
}

describe('event site editor gating', () => {
  it('ORGANIZER can edit the event site (loads org defaults, renders the form)', async () => {
    const c = ctx({ orgRole: 'ORGANIZER' })
    const data = await eventSiteScreen.load(c, { id: 'e1' })
    expect(data.locked).toBeUndefined()
    expect(c.client.o1.getSite).toHaveBeenCalled()
    expect(renderEventSite(data)).toContain('id="s-save"')
  })
  it('Free plan sees the Pro lock', async () => {
    const data = await eventSiteScreen.load(ctx({ entitlements: entitlements('FREE') }), { id: 'e1' })
    expect(data).toMatchObject({ locked: true })
    expect(renderEventSite(data)).toMatch(/richiede Pro/i)
  })
})

describe('inherit / override', () => {
  it('collectEventSite omits inherited fields and includes overridden ones', async () => {
    const root = await mounted(ctx())
    // about override is OFF by default (no event.site) → omitted
    let site = collectEventSite(root)
    expect(site.about).toBeUndefined()
    // turn on the "about" override and type a value
    const aboutSwitch = root.querySelector<HTMLInputElement>('.pf-ovrgroup[data-field="about"] .js-ovr')!
    aboutSwitch.checked = true; aboutSwitch.dispatchEvent(new Event('change'))
    ;(root.querySelector('#s-about') as HTMLTextAreaElement).value = 'Testo evento'
    site = collectEventSite(root)
    expect(site.about).toBe('Testo evento')
  })
  it('preview inherits org content until overridden', async () => {
    const root = await mounted(ctx())
    // org about is inherited → shown in preview
    expect(root.querySelector('#s-preview')!.textContent).toContain('Org about')
  })
  it('event-only tagline is collected without a toggle', async () => {
    const root = await mounted(ctx())
    ;(root.querySelector('#s-tagline') as HTMLInputElement).value = 'Tre giorni'
    expect(collectEventSite(root).tagline).toBe('Tre giorni')
  })
  it('disabling the master switch sets enabled=false', async () => {
    const root = await mounted(ctx())
    const sw = root.querySelector<HTMLInputElement>('#s-enabled')!
    sw.checked = false
    expect(collectEventSite(root).enabled).toBe(false)
  })
  it('save posts the event site to o3', async () => {
    const c = ctx()
    const root = await mounted(c)
    ;(root.querySelector('#s-tagline') as HTMLInputElement).value = 'X'
    root.querySelector<HTMLButtonElement>('#s-save')!.click()
    await vi.waitFor(() => expect(c.client.o3.setEventSite).toHaveBeenCalledWith('e1', expect.objectContaining({ tagline: 'X' })))
  })
})
