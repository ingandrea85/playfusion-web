// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { entitlements } from '@playfusion/entitlements'
import { renderOrgSite, orgSiteScreen, sponsorRow, collectSponsors } from '../src/views/org-site'
import type { ViewCtx } from '../src/view'

const ctx = (over: Partial<ViewCtx> = {}): ViewCtx => ({
  client: { o1: { getSite: vi.fn().mockResolvedValue(null), setSite: vi.fn().mockResolvedValue({}) } } as any,
  orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn(),
  isPlatformAdmin: false, orgRole: 'OWNER', entitlements: entitlements('PRO'), ...over,
})

describe('org site editor gating', () => {
  it('ORGANIZER is forbidden (no API call)', async () => {
    const c = ctx({ orgRole: 'ORGANIZER' })
    const data = await orgSiteScreen.load(c, {})
    expect(data).toMatchObject({ forbidden: true })
    expect(c.client.o1.getSite).not.toHaveBeenCalled()
    expect(renderOrgSite(data)).toMatch(/riservato all'owner/)
  })
  it('Free owner sees the Pro lock', async () => {
    const data = await orgSiteScreen.load(ctx({ entitlements: entitlements('FREE') }), {})
    expect(data).toMatchObject({ locked: true })
    expect(renderOrgSite(data)).toMatch(/richiede Pro/i)
  })
  it('Pro owner loads the form', async () => {
    const data = await orgSiteScreen.load(ctx(), {})
    expect(data.forbidden).toBeUndefined()
    expect(renderOrgSite(data)).toContain('id="s-save"')
  })
})

describe('sponsors editing', () => {
  it('collectSponsors reads rows and drops nameless ones', () => {
    const root = document.createElement('div')
    root.innerHTML = sponsorRow({ name: 'Rossi', url: 'https://r' }) + sponsorRow({ name: '', url: 'https://x' }) + sponsorRow({ name: 'Caffè', tier: 'Partner' })
    expect(collectSponsors(root)).toEqual([{ name: 'Rossi', url: 'https://r' }, { name: 'Caffè', tier: 'Partner' }])
  })
  it('save posts the normalised site defaults', async () => {
    const c = ctx({ client: { o1: { getSite: vi.fn().mockResolvedValue({ about: 'Ciao' }), setSite: vi.fn().mockResolvedValue({}) } } as any })
    const data = await orgSiteScreen.load(c, {})
    const root = document.createElement('div'); root.innerHTML = renderOrgSite(data)
    orgSiteScreen.mount!(root, c, data)
    ;(root.querySelector('#s-about') as HTMLTextAreaElement).value = '  Nuovo testo '
    ;(root.querySelector('#s-venue-name') as HTMLInputElement).value = 'Le Betulle'
    root.querySelector<HTMLButtonElement>('#s-save')!.click()
    await vi.waitFor(() => expect(c.client.o1.setSite).toHaveBeenCalled())
    const [, sent] = (c.client.o1.setSite as any).mock.calls[0]
    expect(sent.about).toBe('Nuovo testo')
    expect(sent.venue.name).toBe('Le Betulle')
  })
  it('add button appends a sponsor row', async () => {
    const c = ctx()
    const data = await orgSiteScreen.load(c, {})
    const root = document.createElement('div'); root.innerHTML = renderOrgSite(data)
    orgSiteScreen.mount!(root, c, data)
    expect(root.querySelectorAll('.pf-sprow').length).toBe(0)
    root.querySelector<HTMLButtonElement>('#s-sp-add')!.click()
    expect(root.querySelectorAll('.pf-sprow').length).toBe(1)
  })
})
